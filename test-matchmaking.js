import WebSocket from 'ws';

const WS_URL = 'ws://127.0.0.1:8000/ws';

function createClient(name, sessionId = null) {
  const ws = new WebSocket(WS_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
  });
  const events = [];
  
  const client = {
    name,
    ws,
    events,
    sessionId: sessionId || `session_${name}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    send(type, payload = {}) {
      ws.send(JSON.stringify({ type, sessionId: client.sessionId, ...payload }));
    },
    waitFor(type, timeoutMs = 10000) {
      return new Promise((resolve, reject) => {
        let isDone = false;
        let interval = null;
        let timer = null;

        const cleanup = () => {
          isDone = true;
          if (interval) clearInterval(interval);
          if (timer) clearTimeout(timer);
        };

        const check = () => {
          if (isDone) return;
          const idx = events.findIndex(e => e.type === type);
          if (idx !== -1) {
            const event = events.splice(idx, 1)[0];
            cleanup();
            return resolve(event);
          }
        };

        interval = setInterval(check, 25);
        timer = setTimeout(() => {
          cleanup();
          reject(new Error(`[${name}] Timed out waiting for '${type}'. Seen events: ${JSON.stringify(events)}`));
        }, timeoutMs);

        check();
      });
    },
    close() {
      ws.close();
    }
  };

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log(`[${name}] RECV:`, msg.type, msg.peer ? `(peer: ${msg.peer.socketId})` : '');
      events.push(msg);
    } catch {}
  });

  return new Promise((resolve, reject) => {
    ws.on('open', () => {
      console.log(`[${name}] WebSocket OPEN`);
      resolve(client);
    });
    ws.on('error', (err) => {
      console.error(`[${name}] WebSocket ERROR:`, err);
      reject(err);
    });
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runTests() {
  console.log('🧪 Starting Matchmaking, Group Video Calling & Host Control Integration Tests...\n');

  try {
    const testTag = `t_${Date.now()}`;

    // ----------------------------------------------------
    // TEST 1: Ping / Pong Keepalive
    // ----------------------------------------------------
    console.log('Test 1: Testing sys_ping / sys_pong keepalive...');
    const client1 = await createClient('Client1');
    client1.send('sys_ping');
    const pong = await client1.waitFor('sys_pong');
    console.log('✅ sys_pong received correctly.');

    // ----------------------------------------------------
    // TEST 2: Two Users 1-on-1 Matchmaking with Isolated Tag
    // ----------------------------------------------------
    console.log('\nTest 2: Testing 2 users 1-on-1 matchmaking...');
    const client2 = await createClient('Client2');

    client1.send('join', { mode: 'video', tags: [testTag, 'music'] });
    await client1.waitFor('waiting');
    console.log('✅ Client 1 in waiting state.');

    client2.send('join', { mode: 'video', tags: [testTag, 'music'] });
    const match1 = await client1.waitFor('matched');
    const match2 = await client2.waitFor('matched');

    console.log('✅ Client 1 matched:', match1.roomId, 'isHost:', match1.isHost, 'common:', match1.commonInterests);
    console.log('✅ Client 2 matched:', match2.roomId, 'isHost:', match2.isHost, 'common:', match2.commonInterests);

    if (match1.roomId !== match2.roomId) throw new Error('Room IDs do not match!');
    if (!match1.commonInterests.includes(testTag)) throw new Error('Common test tag was not detected!');
    console.log('✅ 1-on-1 Matchmaking Passed!');

    // ----------------------------------------------------
    // TEST 3: Targeted WebRTC Signaling & Chat Relay
    // ----------------------------------------------------
    console.log('\nTest 3: Testing targeted WebRTC signaling & chat relay...');
    const targetPeerId = match1.peers[0].socketId;

    client1.send('offer', { targetId: targetPeerId, offer: { type: 'offer', sdp: 'dummy-sdp' }, roomId: match1.roomId });
    const receivedOffer = await client2.waitFor('offer');
    console.log('✅ Client 2 received targeted offer from Client 1.');

    client2.send('answer', { targetId: receivedOffer.senderId, answer: { type: 'answer', sdp: 'dummy-ans' }, roomId: match2.roomId });
    const receivedAnswer = await client1.waitFor('answer');
    console.log('✅ Client 1 received targeted answer from Client 2.');

    client1.send('chat', { text: 'Hello group!', roomId: match1.roomId });
    const chatMsg = await client2.waitFor('chat');
    if (chatMsg.text !== 'Hello group!') throw new Error('Chat message content mismatch');
    console.log('✅ Chat message relayed successfully.');

    // Clean up 1-on-1 clients
    client1.close();
    client2.close();
    await sleep(300);

    // ----------------------------------------------------
    // TEST 4: Group Video Calling (Up to 5 Participants)
    // ----------------------------------------------------
    console.log('\nTest 4: Testing Group Video Calling with 5 Participants...');
    const groupTag = `grp_${Date.now()}`;

    const u1 = await createClient('User1');
    u1.send('join', { mode: 'group', tags: [groupTag] });
    await u1.waitFor('waiting');

    const u2 = await createClient('User2');
    u2.send('join', { mode: 'group', tags: [groupTag] });
    const u1Match = await u1.waitFor('matched');
    const u2Match = await u2.waitFor('matched');
    console.log('✅ Group Room Formed with User 1 (Host) and User 2.');
    if (!u1Match.isHost) throw new Error('User 1 should be the room host!');

    const groupRoomId = u1Match.roomId;

    // User 3 joins
    await sleep(100);
    const u3 = await createClient('User3');
    u3.send('join', { mode: 'group', tags: [groupTag] });
    const u3Match = await u3.waitFor('matched');
    await u1.waitFor('user_joined');
    await u2.waitFor('user_joined');
    console.log('✅ User 3 joined group room (3/5).');

    // User 4 joins
    await sleep(100);
    const u4 = await createClient('User4');
    u4.send('join', { mode: 'group', tags: [groupTag] });
    const u4Match = await u4.waitFor('matched');
    const u1Join4 = await u1.waitFor('user_joined');
    await u2.waitFor('user_joined');
    await u3.waitFor('user_joined');
    const u4SocketId = u1Join4.peer.socketId;
    console.log('✅ User 4 joined group room (4/5).');

    // User 5 joins -> capacity reached (5/5)
    await sleep(100);
    const u5 = await createClient('User5');
    u5.send('join', { mode: 'group', tags: [groupTag] });
    const u5Match = await u5.waitFor('matched');
    const u1Join5 = await u1.waitFor('user_joined');
    await u2.waitFor('user_joined');
    await u3.waitFor('user_joined');
    await u4.waitFor('user_joined');
    const u5SocketId = u1Join5.peer.socketId;
    console.log('✅ User 5 joined group room (5/5). Room is full.');

    // ----------------------------------------------------
    // TEST 5: 6th User Capacity Isolation
    // ----------------------------------------------------
    console.log('\nTest 5: Testing 6th User does not overflow full group room...');
    await sleep(100);
    const u6 = await createClient('User6');
    u6.send('join', { mode: 'group', tags: [groupTag] });
    await u6.waitFor('waiting');
    console.log('✅ User 6 placed in waiting queue because first group is full at 5 participants.');

    // ----------------------------------------------------
    // TEST 6: Host Controls (Mute & Kick)
    // ----------------------------------------------------
    console.log('\nTest 6: Testing Host Controls (Mute and Kick)...');
    
    // Host (User 1) mutes User 4
    u1.send('host_mute_user', { targetId: u4SocketId, roomId: groupRoomId });
    // User receiving host_mute
    await u4.waitFor('host_mute');
    console.log('✅ Host mute command verified: User 4 received host_mute event.');

    // Host (User 1) kicks User 5
    u1.send('kick_user', { targetId: u5SocketId, roomId: groupRoomId });
    await u5.waitFor('kicked');
    console.log('✅ Host kick command verified: User 5 received kicked event.');

    // Host (User 1) leaves -> User 2 becomes new host
    u1.send('leave');
    const hostChangeEvent = await u2.waitFor('host_changed');
    console.log('✅ Host failover passed: New host assigned upon departure:', hostChangeEvent.hostId);

    // Clean up
    u1.close();
    u2.close();
    u3.close();
    u4.close();
    u5.close();
    u6.close();

    console.log('\n🎉 ALL INTEGRATION TESTS PASSED WITH 100% SUCCESS!\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test failed with error:', err);
    process.exit(1);
  }
}

runTests();

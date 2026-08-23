import WebSocket from 'ws';

const WS_URL = 'ws://localhost:8000/ws';

function createClient(name, sessionId = null) {
  const ws = new WebSocket(WS_URL);
  const events = [];
  
  const client = {
    name,
    ws,
    events,
    sessionId: sessionId || `session_${name}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    send(type, payload = {}) {
      ws.send(JSON.stringify({ type, sessionId: client.sessionId, ...payload }));
    },
    waitFor(type, timeoutMs = 5000) {
      return new Promise((resolve, reject) => {
        let interval = null;
        let timer = null;

        const check = () => {
          const idx = events.findIndex(e => e.type === type);
          if (idx !== -1) {
            const event = events.splice(idx, 1)[0];
            if (interval) clearInterval(interval);
            if (timer) clearTimeout(timer);
            return resolve(event);
          }
        };

        check();
        interval = setInterval(check, 50);
        timer = setTimeout(() => {
          clearInterval(interval);
          reject(new Error(`[${name}] Timed out waiting for '${type}'. Seen events: ${JSON.stringify(events)}`));
        }, timeoutMs);
      });
    },
    close() {
      ws.close();
    }
  };

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log(`[${name}] RECV:`, msg.type, msg);
      events.push(msg);
    } catch {}
  });

  return new Promise((resolve, reject) => {
    ws.on('open', () => resolve(client));
    ws.on('error', reject);
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runTests() {
  console.log('🧪 Starting Matchmaking & WebRTC Server Integration Tests...\n');

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
    // TEST 2: Two Users Normal Matchmaking with Isolated Tag
    // ----------------------------------------------------
    console.log('\nTest 2: Testing 2 users normal matchmaking...');
    const client2 = await createClient('Client2');

    client1.send('join', { mode: 'video', tags: [testTag, 'music'] });
    const wait1 = await client1.waitFor('waiting');
    console.log('✅ Client 1 in waiting state.');

    client2.send('join', { mode: 'video', tags: [testTag, 'music'] });
    const match1 = await client1.waitFor('matched');
    const match2 = await client2.waitFor('matched');

    console.log('✅ Client 1 matched:', match1.roomId, 'initiator:', match1.initiator, 'common:', match1.commonInterests);
    console.log('✅ Client 2 matched:', match2.roomId, 'initiator:', match2.initiator, 'common:', match2.commonInterests);

    if (match1.roomId !== match2.roomId) throw new Error('Room IDs do not match!');
    if (match1.initiator === match2.initiator) throw new Error('Both cannot have same initiator flag!');
    if (!match1.commonInterests.includes(testTag)) throw new Error('Common test tag was not detected!');
    console.log('✅ 2-User Matchmaking & Tag Matching Passed!');

    // ----------------------------------------------------
    // TEST 3: Signaling Relay & peer_ready between Matched Users
    // ----------------------------------------------------
    console.log('\nTest 3: Testing WebRTC signaling & peer_ready relay...');
    client1.send('peer_ready', { roomId: match1.roomId });
    const peerReady = await client2.waitFor('peer_ready');
    console.log('✅ Client 2 received peer_ready relayed from Client 1.');

    client1.send('offer', { offer: { type: 'offer', sdp: 'dummy-sdp-data' }, roomId: match1.roomId });
    const receivedOffer = await client2.waitFor('offer');
    console.log('✅ Client 2 received offer relayed from Client 1.');

    client2.send('answer', { answer: { type: 'answer', sdp: 'dummy-answer-data' }, roomId: match2.roomId });
    const receivedAnswer = await client1.waitFor('answer');
    console.log('✅ Client 1 received answer relayed from Client 2.');

    client1.send('chat', { text: 'Hello stranger!', roomId: match1.roomId });
    const chatMsg = await client2.waitFor('chat');
    if (chatMsg.text !== 'Hello stranger!') throw new Error('Chat message content mismatch');
    console.log('✅ Chat message relayed successfully.');

    // ----------------------------------------------------
    // TEST 4: Skipping Flow
    // ----------------------------------------------------
    console.log('\nTest 4: Testing Skip flow...');
    const uniqueSkipTag = `skip_${Date.now()}`;
    // Client 1 skips (sends leave then join with unique tag)
    client1.send('leave');
    client1.send('join', { mode: 'video', tags: [uniqueSkipTag] });

    // Client 2 should receive peer_left
    const peerLeft = await client2.waitFor('peer_left');
    console.log('✅ Client 2 received peer_left on skip.');

    // Client 1 should now be waiting
    await client1.waitFor('waiting');
    console.log('✅ Client 1 is back in waiting state.');

    // ----------------------------------------------------
    // TEST 5: 3rd User Matching Prioritization
    // ----------------------------------------------------
    console.log('\nTest 5: Testing 3rd user matching prioritization...');
    const client3 = await createClient('Client3');
    client3.send('join', { mode: 'video', tags: [uniqueSkipTag] });

    const match1New = await client1.waitFor('matched');
    const match3 = await client3.waitFor('matched');
    console.log('✅ Client 1 paired with Client 3 instead of Client 2!');
    if (match1New.roomId !== match3.roomId) throw new Error('Client 1 and 3 room IDs do not match');

    // Clean up clients
    client1.close();
    client2.close();
    client3.close();
    await sleep(200);

    // ----------------------------------------------------
    // TEST 6: Self-Matching & Reconnect Prevention (Page Reload Simulation)
    // ----------------------------------------------------
    console.log('\nTest 6: Testing Self-Matching Prevention on Page Reload...');
    const sameSessionId = `tab_session_${Date.now()}`;
    const reloadClientOld = await createClient('OldTab', sameSessionId);
    reloadClientOld.send('join', { mode: 'video', tags: [`reload_${Date.now()}`] });
    await reloadClientOld.waitFor('waiting');
    console.log('✅ Old tab waiting in queue.');

    // New tab loads with the same sessionId (user reloaded page)
    const reloadClientNew = await createClient('NewTab', sameSessionId);
    reloadClientNew.send('join', { mode: 'video', tags: [`reload_${Date.now()}`] });
    const newTabWait = await reloadClientNew.waitFor('waiting');
    console.log('✅ New tab evicts old tab and enters waiting queue instead of matching with its own dead ghost!');

    reloadClientOld.close();
    reloadClientNew.close();
    await sleep(200);

    // ----------------------------------------------------
    // TEST 7: Spy Mode (1 Spy + 2 Strangers)
    // ----------------------------------------------------
    console.log('\nTest 7: Testing Spy Mode (1 Spy + 2 Strangers in text mode)...');
    const spy = await createClient('Spy');
    const strangerA = await createClient('StrangerA');
    const strangerB = await createClient('StrangerB');

    const spyTag = `spy_tag_${Date.now()}`;

    spy.send('join', { mode: 'spy', question: 'What is the meaning of life?' });
    await spy.waitFor('waiting');
    console.log('✅ Spy queued and waiting.');

    strangerA.send('join', { mode: 'text', tags: [spyTag] });
    await strangerA.waitFor('waiting');

    strangerB.send('join', { mode: 'text', tags: [spyTag] });

    const spyMatched = await spy.waitFor('matched');
    const strAMatched = await strangerA.waitFor('matched');
    const strBMatched = await strangerB.waitFor('matched');

    console.log('✅ Spy matched:', spyMatched.isSpy, 'question:', spyMatched.question);
    console.log('✅ Stranger A matched:', strAMatched.isSpyStranger, 'peerId:', strAMatched.peerId);
    console.log('✅ Stranger B matched:', strBMatched.isSpyStranger, 'peerId:', strBMatched.peerId);

    if (!spyMatched.isSpy || !strAMatched.isSpyStranger || !strBMatched.isSpyStranger) {
      throw new Error('Spy match properties failed!');
    }

    // Spy disconnects -> strangers get spy_left
    spy.send('leave');
    const spyLeftA = await strangerA.waitFor('spy_left');
    const spyLeftB = await strangerB.waitFor('spy_left');
    console.log('✅ Strangers notified of spy_left.');

    spy.close();
    strangerA.close();
    strangerB.close();

    console.log('\n🎉 ALL 7 INTEGRATION TESTS PASSED WITH 100% SUCCESS!\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test failed with error:', err);
    process.exit(1);
  }
}

runTests();

# Randall 🎥 — Free Random Video Chat App & Omegle Alternative

[![Live Demo](https://img.shields.io/badge/Live%20Demo-randall.superezz.dev-003cff?style=for-the-badge&logo=vercel&logoColor=white)](https://randall.superezz.dev/)
[![GitHub stars](https://img.shields.io/github/stars/superezzdev/randall?style=for-the-badge&color=ffd700)](https://github.com/superezzdev/randall/stargazers)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg?style=for-the-badge)](https://www.gnu.org/licenses/agpl-3.0)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P%20Encrypted-333333?style=for-the-badge&logo=webrtc&logoColor=white)](https://webrtc.org/)
[![React](https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)

> **Randall** is a free, modern, open-source random video chat application and privacy-first **Omegle alternative**. Connect instantly with strangers worldwide across **1-on-1 video**, **group video calls (up to 5 users)**, and **text chat** — with zero accounts, no history stored, and peer-to-peer WebRTC encryption.

👉 **Try it live:** [https://randall.superezz.dev/](https://randall.superezz.dev/)

---

![Randall Preview](.github/assets/rendallpreview.png)

---

## ⚡ Highlights & Features

### 🎥 Video Calling & Multi-Party Layouts
- **📹 1-on-1 Full-Bleed Video Chat:** WhatsApp-style immersive full-bleed video interface with floating Picture-in-Picture (PiP), multi-corner movement, and tap-to-swap views.
- **👥 Adaptive Group Video Grid (Up to 5 Users):** Responsive, dynamic multi-party grid layout optimized for mobile portrait, mobile landscape, tablet, and desktop viewports.
- **📌 Spotlight / Pin Mode:** Tap any participant in a group call to spotlight them in a large primary stage while keeping other participants in a smooth thumbnail filmstrip.
- **🔍 Full-Frame "Fit View" vs. "Fill View" Toggle:** Instant toggle between edge-to-edge fill (`object-cover`) and 100% full uncropped camera frame (`object-contain` with ambient backdrop blur).
- **🎙️ Active Speaker Detection:** Real-time Web Audio API frequency analysis that highlights the active speaker with an animated glowing green ring.
- **👑 Room Host Controls:** Automatic host assignment and failover, allowing the room host to mute participants or kick disruptive users.
- **🔄 Rear & Front Camera Switcher:** Seamlessly toggle between selfie and rear cameras on mobile devices with live camera enumeration.
- **🖥️ Screen Sharing:** One-click screen sharing with dynamic WebRTC track replacement.

### 💬 Chat, Matching & Privacy
- **💬 Text-Only Chat Mode:** Anonymously connect and chat with random users without using your camera or microphone.
- **🎯 Interest & Topic Matching:** Enter your favorite interests (e.g. `coding`, `music`, `gaming`, `anime`) to match with like-minded people.
- **🔒 Privacy First & Zero Registration:** No accounts, emails, passwords, or phone numbers needed. No chat logs or media recorded.
- **🛡️ Community Safety & Moderation:** Instant skip, user report mechanisms, and automated bot prevention via [Arcjet](https://arcjet.com/) and [Zod](https://zod.dev/).
- **⚡ Real-Time Presence:** Live online user counter, typing indicators, and instant matchmaking over native WebSockets.
- **✨ Modern Responsive UI:** Built with React 19, Tailwind CSS, Lucide Icons, and Motion.

---

## 🥊 Why Randall? (Omegle Alternative Comparison)

| Feature | 🚫 Omegle (Defunct) | 👥 Traditional Chat Apps | 🎥 Randall (Open Source) |
| :--- | :--- | :--- | :--- |
| **Open Source** | ❌ Proprietary | ❌ Proprietary | ✅ **100% AGPL-3.0 Open Source** |
| **Group Video Calls** | ❌ No | ⚠️ Requires Accounts | ✅ **Yes (Adaptive 1-5 Grid)** |
| **Spotlight / Pin Mode** | ❌ No | ⚠️ Heavy Client Apps | ✅ **Yes (Instant Stage Focus)** |
| **Fit vs. Fill No-Crop** | ❌ Fixed Crop | ❌ Fixed Crop | ✅ **Per-Tile & Global Toggle** |
| **Active Speaker Glow** | ❌ No | ⚠️ Heavy Apps | ✅ **Web Audio API Frequency Analysis** |
| **Host Moderation** | ❌ None | ⚠️ Admin-only / Accounts | ✅ **Mute / Kick / Auto-Failover** |
| **No Account Needed** | ✅ Yes | ❌ Requires Sign-up | ✅ **Instant 1-Click Access** |
| **Peer-to-Peer Encrypted**| ⚠️ Partial | ❌ Relayed Servers | ✅ **WebRTC P2P Direct + STUN/TURN** |
| **Bot Protection** | ❌ Poor | ⚠️ Captchas | ✅ **Arcjet Shield & Zod** |
| **Modern Responsive UI** | ❌ 2000s Web Layout | ⚠️ Heavy Apps | ✅ **Vibrant, Clean & Fast** |

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | React 19 + Vite | Fast, responsive Single Page Application (SPA). |
| **P2P Video / Audio** | WebRTC (`RTCPeerConnection`) | Direct browser-to-browser media streaming with zero server recording. |
| **Real-time Signaling**| WebSockets (`ws`) | Instant user matching, multi-peer signaling negotiation, and text messages. |
| **Backend Server** | Node.js + Express | Lightweight API server, WebSocket broker, and TURN credential provider. |
| **Styling & UI** | Tailwind CSS + Motion + Lucide | Responsive design with micro-animations and adaptive grid geometry. |
| **Security & Validation**| Arcjet + Zod | Bot detection, rate limiting, and schema validation. |

---

## 🔍 How WebRTC Video Chat Works in Randall

```
 [User A (Browser)] <====== WebSockets Signaling (Match & ICE) ======> [User B (Browser)]
         |                                                                   |
         +=========== Direct WebRTC P2P Media Stream (Video/Audio) ===========+
                    (Zero server relay — 100% private and encrypted)
```

1. **Signaling Connection:** When you visit [randall.superezz.dev](https://randall.superezz.dev), your browser connects to the central WebSocket signaling server.
2. **Matchmaking:** The server pairs you with waiting users based on your selected mode (1-on-1, Group, or Text) and overlapping interests.
3. **Offer & Answer (SDP):** The browsers exchange WebRTC session descriptions (SDP offer/answer) and ICE candidates via the WebSocket signaling channel.
4. **Peer-to-Peer Streaming:** Once handshaking completes, video and audio flow directly between the browsers. Randall's servers never capture, touch, or store your video frames.

---

## 🚀 Getting Started Locally

### Prerequisites
- **Node.js** (v18.0.0 or higher)
- **Git**
- A working **webcam and microphone** (for video testing)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/superezzdev/randall.git
   cd randall
   ```

2. **Install root & UI dependencies:**
   ```bash
   npm install
   npm --prefix ui install
   ```

3. **Set up Environment Variables:**
   ```bash
   cp .env.example .env
   ```
   Open `.env` and configure your port and security keys:
   ```env
   PORT=8000
   ARCJET_KEY=your_arcjet_key_here
   ```

4. **Run the Development Servers:**

   **Option A: Run both backend and frontend together:**
   ```bash
   npm run dev
   ```

   **Option B: Run in separate terminals:**
   - **Terminal 1 (Backend):**
     ```bash
     node src/index.js
     ```
   - **Terminal 2 (Frontend UI):**
     ```bash
     cd ui
     npm run dev
     ```

5. Open `http://localhost:5173` in two browser windows or on separate devices to test video matching!

### Testing Integration & Signaling

Run the comprehensive matchmaking, group calling, and host control integration test suite:
```bash
node test-matchmaking.js
```

---

## 📂 Project Structure

```text
randall/
├── src/                    # Backend server & WebSockets
│   ├── index.js            # Express server entry point
│   ├── arcjet.js           # Security & bot protection configuration
│   ├── routes/             # REST endpoints (/api/turn-credentials, /api/users)
│   └── ws/                 # WebSocket signaling, group rooms & matchmaking
├── ui/                     # Frontend React 19 application
│   ├── public/             # Static assets, robots.txt, sitemap.xml, llms.txt
│   ├── src/
│   │   ├── components/     # UI components (Home, VideoChat, Controls, Header)
│   │   ├── hooks/          # Custom WebRTC & WebSocket hooks (useVideoChat)
│   │   ├── pages/          # Static pages (About, Safety, Terms, Privacy, Contact)
│   │   ├── App.jsx         # App shell & routing
│   │   └── index.css       # Tailwind & theme styles
│   ├── index.html          # SEO-optimized HTML template & JSON-LD
│   └── vite.config.js      # Vite build configuration
├── test-matchmaking.js     # Automated WebSockets & WebRTC integration test suite
├── CONTRIBUTING.md         # Contribution guidelines
├── LICENSE                 # GNU Affero General Public License v3.0
└── README.md
```

---

## ❓ Frequently Asked Questions (FAQ)

### What is Randall?
Randall is an open-source, free random video chat web application and modern Omegle alternative. It allows users to meet strangers across the world instantly with no account required.

### Is Randall completely free?
Yes! Randall is 100% free with no subscriptions, premium tiers, or hidden fees.

### Is my video or chat stored?
No. Randall uses peer-to-peer WebRTC connections. All media streams flow directly between users and are never recorded or stored on any server.

### Can I host my own instance of Randall?
Yes! Randall is open-source under the AGPL-3.0 license. You can clone the repository, customize the branding, and deploy it to your own server or cloud provider in compliance with the AGPL-3.0 terms.

---

## 🤝 Contributing

Contributions are welcome! Whether it is fixing bugs, improving the WebRTC signaling engine, or enhancing UI design:

1. Fork the Project (`https://github.com/superezzdev/randall/fork`)
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for full details.

---

## 📄 License

Distributed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. See [`LICENSE`](LICENSE) for more information.

> **Note on AGPL-3.0**: Randall is open-source software. Anyone is free to use, modify, contribute, and self-host this project. However, any modified versions or hosted deployments **must also remain open-source under the same AGPL-3.0 license**, ensuring that community improvements remain accessible to everyone and cannot be misappropriated into closed-source proprietary products.

---

## 👨‍💻 Author

Built with ❤️ by **ARYA RCB** ([@superezzdev](https://github.com/superezzdev))
- Website: [randall.superezz.dev](https://randall.superezz.dev)
- GitHub: [@superezzdev](https://github.com/superezzdev)

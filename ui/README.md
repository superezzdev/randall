# Randall UI 🎥

The frontend web application for **Randall**, built with React 19, Vite, Tailwind CSS, Motion, and Lucide Icons.

## 🚀 Getting Started

### Install Dependencies
```bash
npm install
```

### Run Development Server
```bash
npm run dev
```

### Build for Production
```bash
npm run build
```

### Lint Code
```bash
npm run lint
```

## 📂 Architecture

- **`src/components/`**: React UI components including `VideoChat.jsx`, `Home.jsx`, controls, and overlays.
- **`src/hooks/`**: WebRTC P2P signaling (`useVideoChat.js`), draggable viewport (`useDraggable.js`), and mobile visual viewport handling.
- **`src/pages/`**: Static pages (`About.jsx`, `Privacy.jsx`, `Terms.jsx`, `Safety.jsx`, `Contact.jsx`).

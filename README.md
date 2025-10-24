# Minimal Timer

Ultra-minimal, production-ready stopwatch and countdown timer web app. Works entirely client-side with high-precision timing and offline support.

## 🚀 Live Demo

**Production:** [https://minimal-timer.netlify.app](https://minimal-timer.netlify.app)

**GitHub:** [https://github.com/siimplelab/minimal-timer](https://github.com/siimplelab/minimal-timer)

## ✨ Features

### Timing Modes
- **Stopwatch**: Counts up from 00:00:00.00 (centiseconds precision)
- **Countdown**: Set target time, alerts when complete

### Controls
- **Buttons**: Start/Pause, Reset
- **Keyboard**:
  - `Space` - Start/Pause
  - `R` - Reset
  - `E` - Edit time
  - `M` - Toggle mode
  - `F` - Fullscreen
- **Touch**:
  - Single tap - Start/Pause
  - Long-press Reset - Confirm reset
  - Double-tap time - Toggle mode
  - Tap time - Edit value

### Technical Highlights
- **High-Precision Timing**: Web Worker with `performance.now()` - no drift
- **~60Hz Refresh**: Smooth display via `requestAnimationFrame`
- **Visibility Handling**: Maintains accuracy when tab is backgrounded
- **Main-Thread Fallback**: Graceful degradation if Worker unavailable
- **PWA**: Installable, works offline after first load
- **No Dependencies**: Zero external libraries or frameworks

### UX Features
- Responsive design (mobile-first)
- Auto light/dark theme + manual toggle
- Fluid typography with `clamp()`
- Sound (Web Audio) + vibration alerts
- Fullscreen support
- LocalStorage persistence (mode, countdown, theme, mute)

### Accessibility
- Semantic HTML with ARIA attributes
- Keyboard navigation
- Screen reader announcements
- Focus states and high contrast
- Reduced motion support

## 🛠️ Tech Stack

- Plain HTML/CSS/JS (ES6+)
- Web Workers API
- Web Audio API
- Service Workers (PWA)
- LocalStorage API

## 📦 Usage

### Local Development

Simply open `index.html` in a browser, or serve via HTTP:

```bash
# Python
python3 -m http.server 8000

# Node.js
npx serve

# PHP
php -S localhost:8000
```

Then visit `http://localhost:8000`

### Deployment

The app is static and can be deployed to any static hosting:

- Netlify
- Vercel
- GitHub Pages
- Cloudflare Pages
- S3 + CloudFront

## 📄 Files

- `index.html` - Semantic HTML structure
- `styles.css` - Responsive CSS with themes
- `script.js` - Timer logic and UI interactions
- `worker.js` - High-precision timing Web Worker
- `sw.js` - Service Worker for offline support
- `manifest.webmanifest` - PWA metadata

## 🎯 Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Android)

## 📝 License

MIT License - feel free to use and modify

## 🤖 Credits

Built with [Claude Code](https://claude.com/claude-code)

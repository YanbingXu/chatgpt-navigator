# ChatGPT Navigator

![ChatGPT Navigator](public/icons/icon-128.png)

Supercharge your ChatGPT experience with timeline navigation and session folder management. Inspired by Gemini Voyager(https://github.com/Nagi-ovo/gemini-voyager), built for ChatGPT.

## Features

- **🧭 Timeline Navigation Bar (Right Side)**
  - Automatically detects User and Assistant turns in long conversations
  - Generates a sleek, vertical dot-navigation timeline
  - Tracks your active reading position dynamically
  - Click any dot to smoothly scroll directly to that message

- **📁 Session Folder Management (Left Sidebar)**
  - Injects a native-feeling folder tree above your chat history
  - Organize your ChatGPT conversations into custom folders
  - **Three ways to organize:**
    1. Click the `➕` button on any folder to quickly add your current active chat
    2. Drag & Drop conversations from the native sidebar into folders
    3. Right-click any conversation in the sidebar and select "Move to folder"
  - Data is safely stored locally in your browser (`chrome.storage.local`)

- **🎨 Seamless Native Integration**
  - Full Light/Dark mode support matching ChatGPT's design system
  - Gracefully handles ChatGPT's seamless SPA (Single Page Application) navigation

## Installation

### Load Unpacked (Developer Mode)

1. Clone the repository:
   ```bash
   git clone https://github.com/yanbing-xu/chatgpt-navigator.git
   cd chatgpt-navigator
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Open Chrome and navigate to `chrome://extensions`
5. Enable **Developer Mode** (top right corner)
6. Click **Load unpacked** and select the `/dist` directory in this project folder

## Development

This project is built with **React**, **TypeScript**, and **Vite** (via `@crxjs/vite-plugin`).

- `npm run dev` - Start the Vite dev server with Hot Module Replacement (HMR) for Chrome extensions.
- `npm run build` - Build the production-ready extension.
- `npm run lint` - Run ESLint.
- `npm run typecheck` - Run TypeScript compiler checks.

### Architecture Notes

- **Content Scripts**: Kept deliberately lightweight. UI injections (`TimelineManager`, `FolderManager`) are built with vanilla DOM APIs to avoid React runtime overhead on every ChatGPT page.
- **CSS**: All injected styles use the `cn-*` prefix to prevent collisions with ChatGPT's complex Tailwind-based stylesheet.
- **State**: Uses a singleton `StorageService` to abstract `chrome.storage` logic away from UI components.

## Contributing

Contributions, issues, and feature requests are welcome!
1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes following [Conventional Commits](https://www.conventionalcommits.org/) (`git commit -m 'feat(scope): add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is open-source. (Add your license here, e.g., MIT).

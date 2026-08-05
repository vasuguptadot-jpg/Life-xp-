import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';
import { initTheme } from './hooks/use-theme';

// Apply saved theme before first paint to avoid flash
initTheme();

createRoot(document.getElementById('root')!).render(<App />);

import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerServiceWorker } from './offline/registerServiceWorker.ts';

// Register service worker for offline asset caching
registerServiceWorker();

createRoot(document.getElementById('root')!).render(<App />);

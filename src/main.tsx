import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { initSync } from './lib/store';

initSync();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

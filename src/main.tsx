import React from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App';
import './styles/glass-tokens.css';
import './app.css';
import './components/ui/magic-components.css';
import './app/design-tokens.css';
import './components/ui/design-system-primitives.css';
import './auth/auth-access.css';

createRoot(document.getElementById('root')).render(<React.StrictMode><MotionConfig reducedMotion="user"><App /></MotionConfig></React.StrictMode>);

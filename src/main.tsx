import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { PasswordRecoveryPage } from './components/auth/PasswordRecoveryPage';
import './index.css';
import './services/productionAuthorityPatch';
import './services/productionSecurityPatch';
import './services/productionHistoryPatch';

const normalizedHash = window.location.hash.toLowerCase();
const recoveryRoute =
  normalizedHash.includes('recover-password') ||
  normalizedHash.includes('type=recovery') ||
  normalizedHash.includes('access_token=') ||
  new URLSearchParams(window.location.search).has('code');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {recoveryRoute ? <PasswordRecoveryPage /> : <App />}
  </StrictMode>,
);

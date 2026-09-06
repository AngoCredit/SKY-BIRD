import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { PasswordRecoveryPage } from './components/auth/PasswordRecoveryPage';
import './index.css';
import './services/productionAuthorityPatch';
import './services/productionSecurityPatch';
import './services/productionHistoryPatch';

const recoveryRoute = window.location.hash.toLowerCase().replace('#', '') === 'recover-password';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {recoveryRoute ? <PasswordRecoveryPage /> : <App />}
  </StrictMode>,
);

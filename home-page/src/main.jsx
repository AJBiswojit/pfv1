import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import '@fontsource-variable/manrope';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/sections.css';
import './styles/product.css';
import './styles/shopping.css';
import './styles/pages.css';
import App from './App.jsx';
import { ShopProvider } from './state/ShopContext.jsx';
import { UIProvider } from './state/UIContext.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <MotionConfig reducedMotion="user">
        <UIProvider>
          <ShopProvider>
            <App />
          </ShopProvider>
        </UIProvider>
      </MotionConfig>
    </BrowserRouter>
  </React.StrictMode>,
);

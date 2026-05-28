import React from 'react';
import ReactDOM from 'react-dom/client';
import ClientApp from './ClientApp';
import './index.css';

// Точка входа клиентской презентации (договор поручения, Гл. 49 ГК РФ).
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ClientApp />
  </React.StrictMode>,
);

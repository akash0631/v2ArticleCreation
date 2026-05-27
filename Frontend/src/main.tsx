import ReactDOM from 'react-dom/client'
import App from './AppModern.tsx'
import { QueryProvider } from './app/providers/QueryProvider'
import { initSentry } from './config/sentry'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles/tailwind.css'
import './styles/index.css'

initSentry()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <QueryProvider>
      <App />
    </QueryProvider>
  </ErrorBoundary>,
)

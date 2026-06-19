import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Instances from '@/pages/Instances';
import Monitor from '@/pages/Monitor';
import Costs from '@/pages/Costs';
import ChatReact from '@/pages/ChatReact';
import ChatLit from '@/pages/ChatLit';
import Users from '@/pages/Users';
import Audit from '@/pages/Audit';
import ToolsCatalog from '@/pages/ToolsCatalog';
import McpConfig from '@/pages/McpConfig';
import NotFound from '@/pages/NotFound';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* 受保护路由，统一使用 Layout */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route
              path="/instances"
              element={
                <ProtectedRoute permission={{ resource: 'instance', action: 'list' }}>
                  <Instances />
                </ProtectedRoute>
              }
            />
            <Route
              path="/monitor"
              element={
                <ProtectedRoute permission={{ resource: 'monitor', action: 'view' }}>
                  <Monitor />
                </ProtectedRoute>
              }
            />
            <Route
              path="/costs"
              element={
                <ProtectedRoute permission={{ resource: 'cost', action: 'view' }}>
                  <Costs />
                </ProtectedRoute>
              }
            />
            <Route path="/chat/react" element={<ChatReact />} />
            <Route path="/chat/lit" element={<ChatLit />} />
            <Route
              path="/users"
              element={
                <ProtectedRoute permission={{ resource: 'user', action: 'list' }}>
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route
              path="/audit"
              element={
                <ProtectedRoute permission={{ resource: 'audit', action: 'view' }}>
                  <Audit />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tools"
              element={
                <ProtectedRoute permission={{ resource: 'instance', action: 'view' }}>
                  <ToolsCatalog />
                </ProtectedRoute>
              }
            />
            <Route
              path="/mcp"
              element={
                <ProtectedRoute permission={{ resource: 'mcp', action: 'manage' }}>
                  <McpConfig />
                </ProtectedRoute>
              }
            />
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

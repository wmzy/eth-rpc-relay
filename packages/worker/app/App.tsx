import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Monitor } from "./pages/Monitor";
import { Providers } from "./pages/Providers";
import { TestConsole } from "./pages/TestConsole";

export const App = () => (
  <BrowserRouter>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/monitor" replace />} />
        <Route path="monitor" element={<Monitor />} />
        <Route path="providers" element={<Providers />} />
        <Route path="test" element={<TestConsole />} />
      </Route>
    </Routes>
  </BrowserRouter>
);

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import BottomNav from './components/BottomNav';
import HomePage from './pages/HomePage';
import AddItemPage from './pages/AddItemPage';
import LocationsPage from './pages/LocationsPage';
import SettingsPage from './pages/SettingsPage';
import { seedDefaultLocations } from './services/db';
import { checkExpiringSoon } from './services/notifications';

function App() {
  useEffect(() => {
    seedDefaultLocations();
    if ('Notification' in window && Notification.permission === 'granted') {
      checkExpiringSoon();
    }
  }, []);

  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/add" element={<AddItemPage />} />
          <Route path="/locations" element={<LocationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}

export default App;

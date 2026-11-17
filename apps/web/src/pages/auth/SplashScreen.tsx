import '../../styles/splash.css';
import Logo from '../../components/common/Logo';

export default function SplashScreen({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <main className="splash-page">
      <div className="splash-content">
        <div className="splash-logo" aria-label="HydroSense logo">
          <Logo size={80} />
        </div>
        <h1 className="splash-title">HYDROSENSE</h1>
        <div className="splash-divider" aria-hidden="true" />
        <p className="splash-tagline">REAL-TIME WATER QUALITY MONITORING</p>
        <button className="splash-cta" type="button" onClick={onGetStarted}>
          Get Started
        </button>
      </div>
    </main>
  );
}

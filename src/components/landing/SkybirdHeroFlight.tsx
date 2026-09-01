import React, { useMemo } from 'react';
import mascotCoolVideo from '../../assets/images/skybird_mascot_cool.mp4';

export const SkybirdHeroFlight: React.FC = () => {
  // Ambient particle background
  const ambientParticles = useMemo(() => {
    return Array.from({ length: 8 }).map((_, idx) => ({
      id: idx,
      top: `${12 + idx * 11}%`,
      left: `${(idx * 15 + 5) % 90}%`,
      size: `${4 + (idx % 3) * 4}px`,
      duration: `${3 + (idx % 4) * 2}s`,
      delay: `${-idx * 0.5}s`,
    }));
  }, []);

  return (
    <div className="relative w-full h-[300px] sm:h-[360px] lg:h-[420px] flex items-center justify-center overflow-visible select-none">
      {/* AMBIENT BACKGROUND GLOW */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
        <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-amber-500/15 rounded-full blur-[90px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-cyan-500/10 rounded-full blur-[100px]" />

        {ambientParticles.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full bg-amber-400/40 blur-[1px] animate-ping"
            style={{
              top: p.top,
              left: p.left,
              width: p.size,
              height: p.size,
              animationDuration: p.duration,
              animationDelay: p.delay,
            }}
          />
        ))}
      </div>

      {/* MASCOT VIDEO — fills full container width, video provides its own animation */}
      <div className="relative z-10 w-full filter drop-shadow-[0_12px_30px_rgba(245,158,11,0.50)]">
        <video
          src={mascotCoolVideo}
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-auto object-contain pointer-events-none"
        />
      </div>
    </div>
  );
};

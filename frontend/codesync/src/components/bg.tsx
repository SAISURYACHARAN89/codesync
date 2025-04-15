"use client";
import React from "react";
import { ShootingStars } from "./ui/shooting-stars";
// import { StarsBackground } from "./stars-backgound";
import { StarsBackground } from "./ui/stars-backgound";

export const ShootingStarsAndStarsBackgroundDemo = () => {
  return (
    <div style={{
      position: "absolute",
      inset: 0,
      overflow: "hidden",
      background: "linear-gradient(to bottom, #0a0e17, #1a1a2e)"
    }}>
      <StarsBackground></StarsBackground>
      <ShootingStars 
        minDelay={2000}
        maxDelay={5000}
        starColor="#9E00FF"
        trailColor="#2EB9DF"
      />
    </div>
  );
};
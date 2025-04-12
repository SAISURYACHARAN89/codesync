import { motion, useAnimation, AnimatePresence } from "framer-motion";
import { useEffect } from "react";

const AnimatedHeading = () => {
  const controls = useAnimation();

  useEffect(() => {
    const sequence = async () => {
      await controls.start("visible");
      await controls.start({
        scale: [1, 1.05, 1],
        transition: { duration: 1.5, repeat: Infinity, repeatType: "reverse" },
      });
    };
    sequence();
  }, [controls]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.3,
      },
    },
  };

  const letterVariants = {
    hidden: {
      opacity: 0,
      y: 50,
      rotate: -10,
    },
    visible: {
      opacity: 1,
      y: 0,
      rotate: 0,
      transition: {
        type: "spring",
        damping: 12,
        stiffness: 200,
      },
    },
  };

  const word = "Code Sync".split(" ");

  return (
    <motion.div
      style={{
        position: "relative",
        overflow: "hidden",
        display: "inline-block",
      }}
      initial="hidden"
      animate={controls}
      variants={containerVariants}
    >
      {word.map((word, wordIndex) => (
        <div
          key={wordIndex}
          style={{ display: "inline-block", marginRight: "10px" }}
        >
          {[...word].map((letter, letterIndex) => (
            <motion.span
              key={letterIndex}
              style={{
                display: "inline-block",
                color: "#d84041",
                fontSize: "3rem",
                fontWeight: 700,
                textShadow: "0 4px 8px rgba(0,0,0,0.2)",
              }}
              variants={letterVariants}
              custom={letterIndex}
            >
              {letter}
            </motion.span>
          ))}
        </div>
      ))}

      {/* Glow effect */}
      <motion.div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            "radial-gradient(circle, rgba(216,64,65,0.4) 0%, rgba(216,64,65,0) 70%)",
          zIndex: -1,
        }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{
          opacity: [0, 0.6, 0],
          scale: 1.5,
          transition: {
            duration: 3,
            repeat: Infinity,
            repeatDelay: 2,
          },
        }}
      />
    </motion.div>
  );
};

export default AnimatedHeading;

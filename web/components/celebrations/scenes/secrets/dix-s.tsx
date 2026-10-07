"use client";

import { motion } from "framer-motion";
import { GOLD, GOLD_HI, Glow, MetalText, Rays } from "../../kit";
import { SMedal } from "../streak/caption";
import { SecretStage, type SecretProps } from "./stage";

/** dix-s : dix médaillons S se posent en couronne, un par un ; la couronne tourne et se resserre, le 10 brille au centre. */
export default function DixS({ title, description }: SecretProps) {
  return (
    <SecretStage tint={GOLD} accent={GOLD} title={title} description={description} captionDelay={1.5}>
      <Rays count={20} color={GOLD_HI} delay={1.1} spin={20} duration={2.2} peak={0.45} inner={30} outer={150} />
      <Glow color={GOLD} size={240} delay={1.05} strength={45} />
      <motion.div className="absolute inset-0" initial={{ rotate: 0, scale: 1 }} animate={{ rotate: 36, scale: 0.9 }} transition={{ delay: 0.95, duration: 0.8, ease: [0.4, 0, 0.2, 1] }}>
        {Array.from({ length: 10 }, (_, index) => {
          const angle = (index / 10) * Math.PI * 2 - Math.PI / 2;
          return (
            <motion.div key={index} className="absolute" style={{ left: 150 + Math.cos(angle) * 112 - 19, top: 150 + Math.sin(angle) * 112 - 19 }} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 + index * 0.08, type: "spring", stiffness: 420, damping: 15 }}>
              <SMedal size={38} />
            </motion.div>
          );
        })}
      </motion.div>
      <div className="absolute inset-0 grid place-items-center">
        <motion.div initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.05, type: "spring", stiffness: 260, damping: 14 }}>
          <MetalText metal="or" style={{ fontSize: 92, lineHeight: 1, display: "block" }}>
            10
          </MetalText>
        </motion.div>
      </div>
    </SecretStage>
  );
}

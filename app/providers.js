"use client";

import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import TagManager from "react-gtm-module";
import { SessionProvider } from "next-auth/react";
import { Analytics } from "@vercel/analytics/react";
import GraphContext from "../libs/context/graphcontrol";

const tagManagerArgs = {
  gtmId: "GTM-P4M975K",
};

export default function Providers({ children }) {
  const [upperBound, setUpperBound] = useState(2.2);
  const [lowerBound, setLowerBound] = useState(1);

  const updateBounds = (event) => {
    const source = event?.currentTarget || event?.target;
    const nextLower = Number.parseFloat(source?.dataset?.lowerbound);
    const nextUpper = Number.parseFloat(source?.dataset?.upperbound);

    if (Number.isFinite(nextLower)) {
      setLowerBound(nextLower);
    }

    if (Number.isFinite(nextUpper)) {
      setUpperBound(nextUpper);
    }
  };

  useEffect(() => {
    TagManager.initialize(tagManagerArgs);
  }, []);

  const graphContextValue = useMemo(() => ({
    upperBound,
    lowerBound,
    updateBounds,
  }), [upperBound, lowerBound]);

  return (
    <SessionProvider>
      <GraphContext.Provider value={graphContextValue}>
        {children}
      </GraphContext.Provider>
      <Analytics />
    </SessionProvider>
  );
}

Providers.propTypes = {
  children: PropTypes.node.isRequired,
};

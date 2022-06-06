import { createContext } from 'react';

const GraphContext = createContext({
    upperBound: 2.2,
    lowerBound: 0.96,
    updateBounds: () => {},
});

export default GraphContext;
import { createContext } from 'react';

const GraphContext = createContext({
    upperBound: 2.2,
    lowerBound: 1.0,
    updateBounds: () => {},
});

export default GraphContext;
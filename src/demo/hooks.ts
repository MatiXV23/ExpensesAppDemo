import { useSyncExternalStore } from 'react';
import { getConfig, subscribeConfig } from '../mocks/config';
import { getProgress, subscribeProgress } from '../mocks/events';

export const useDemoConfig = () => useSyncExternalStore(subscribeConfig, getConfig);
export const useDemoProgress = () => useSyncExternalStore(subscribeProgress, getProgress);

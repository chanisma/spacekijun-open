import { useSyncExternalStore } from 'react';
import { customVersionOf, subscribeCustomVersion } from '../model/catalog';

/** 나만의 꾸미기 판 번호 — 디자인·소품 그림이 도착하면 바뀐다. 한 번 그리고 마는 그림(미리보기·친구 방)이 의존성에 넣는다 */
export const useCustomVersion = () => useSyncExternalStore(subscribeCustomVersion, customVersionOf, customVersionOf);

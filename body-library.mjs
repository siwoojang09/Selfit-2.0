import * as THREE from './vendor/three.module.js';
import {loadAnatomy} from './anatomy-assets/load.mjs';

const [female,male]=await Promise.all(['female','male'].map(model=>loadAnatomy(model,THREE)));
export const anatomyLibrary={female,male};

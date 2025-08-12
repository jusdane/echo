import { createRouter, createWebHashHistory } from 'vue-router';
import Studio from '../views/Studio.vue';
import Patch from '../views/Patch.vue';
export default createRouter({ history: createWebHashHistory(), routes:[{path:'/',component:Studio},{path:'/patch',component:Patch}] });

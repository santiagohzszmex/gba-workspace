import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import {lapisDevFixtures} from './scripts/lapis-dev-fixtures.mjs';
import {videoDevFixtures} from './scripts/video-dev-fixtures.mjs';
export default defineConfig({plugins:[react(),videoDevFixtures(),...(process.env.WORKSPACE_LAPIS_DEMO==='1'?[lapisDevFixtures()]:[])],resolve:{alias:{'/src':path.resolve('src')}},cacheDir:'.vite',define:{'import.meta.env.VITE_GBA_ID_API_URL':JSON.stringify(process.env.VITE_GBA_ID_API_URL||'https://gba.software/api/gba-id')},root:'workspace',envDir:'..',base:'./',server:{port:1420,strictPort:true,fs:{allow:[path.resolve('.')]},watch:{ignored:['**/src-tauri/**']}},build:{outDir:'../workspace-dist',emptyOutDir:true,target:'safari14',rollupOptions:{input:path.resolve('workspace/index.html')}}});

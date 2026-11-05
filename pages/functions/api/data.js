// Pages Function: GET /api/data
import { handleData } from './_shared.js';
import SNAPSHOT from '../_snapshot.json';

export const onRequestGet = (context) =>
  handleData(context.request, context.env, (p) => context.waitUntil(p), SNAPSHOT);

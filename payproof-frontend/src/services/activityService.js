import { request } from "./api.js";

export const getActivity = () => request("/api/activity");

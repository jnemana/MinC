// src/utils/UsePageTitle.js

import { useEffect } from "react";

export default function usePageTitle(title) {
  useEffect(() => {
    if (!title) return;
    const prev = document.title;
    document.title = title;
    return () => { document.title = prev; };
  }, [title]);
}

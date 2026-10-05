import { useState, useEffect } from 'react';
import { checkBackendHealth } from '../services/api';
import { HealthCheckResponse } from '../types';

export function useHealth() {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    checkBackendHealth()
      .then((data) => {
        if (isMounted) {
          setHealth(data);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setHealth({ status: 'error' });
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return { health, isLoading };
}

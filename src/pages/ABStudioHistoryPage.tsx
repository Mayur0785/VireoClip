import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FlaskConical } from 'lucide-react';
import { ABExperimentHistory } from '../components/abStudio/ABExperimentHistory';

export const ABStudioHistoryPage: React.FC = () => {
  const navigate = useNavigate();

  const handleSelectExperiment = (experimentId: string, clipId: string) => {
    navigate(`/clips/${clipId}/edit?tab=ab_studio&experimentId=${experimentId}`);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/40 pb-6">
        <div>
          <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase">
            <FlaskConical className="w-4 h-4 text-orange-500" />
            <span>Vireo Intelligence · Phase 32</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight mt-1">
            A/B Experiment History & Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Review historical split-testing performance, statistical significance, confidence intervals,
            and download CSV reports with full audit provenance.
          </p>
        </div>
      </div>

      {/* Main Experiment History Component */}
      <ABExperimentHistory onSelectExperiment={handleSelectExperiment} />
    </div>
  );
};

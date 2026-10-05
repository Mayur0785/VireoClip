import { SmartReframeService } from '../server/src/services/smartReframeService.js';
import { execFileSync } from 'child_process';

async function main() {
  console.log('=== SECTION 2: VERIFY PYTHON CV RUNTIME ===\n');

  const pythonBin = (SmartReframeService as any).getPythonPath();
  console.log('Resolved Python binary:', pythonBin);

  const script = `
import sys
import cv2
import numpy as np

print("PYTHON_VERSION:" + sys.version.split()[0])
print("OPENCV_VERSION:" + cv2.__version__)
print("NUMPY_VERSION:" + np.__version__)
`;

  const output = execFileSync(pythonBin, ['-c', script], { encoding: 'utf8' });
  console.log(output.trim());

  // Test smart_reframe.py import
  const testImport = `
import sys
sys.path.append("server/python")
import smart_reframe
print("SMART_REFRAME_IMPORT:SUCCESS")
`;
  const importOut = execFileSync(pythonBin, ['-c', testImport], { encoding: 'utf8' });
  console.log(importOut.trim());
}

main().catch(console.error);

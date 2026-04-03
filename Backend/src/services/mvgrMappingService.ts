import * as fs from 'fs';
import * as path from 'path';

// JSON files are at workspace root, one level above the Backend folder
// __dirname = Backend/src/services -> go up 3 levels to reach workspace root
const WORKSPACE_ROOT = path.join(__dirname, '..', '..', '..');

class MvgrMappingService {
  private macroMvgrMap: Map<string, string> = new Map(); // code -> fullForm
  private mainMvgrMap: Map<string, string> = new Map(); // code -> fullForm
  private weave2Map: Map<string, string> = new Map(); // code -> fullForm
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[MvgrMappingService] Already initialized, skipping reload');
      return;
    }

    try {
      console.log('[MvgrMappingService] Initializing MVGR mappings...');

      // Book10.json -> Macro MVGR ("OTHER MVGR - 01")
      this.loadMappingFromFile(
        path.join(WORKSPACE_ROOT, 'Book10.json'),
        'OTHER MVGR - 01',
        this.macroMvgrMap
      );
      console.log(`[MvgrMappingService] Loaded ${this.macroMvgrMap.size} macro MVGR mappings from Book10.json`);

      // Book11.json -> Main MVGR ("OTHER MVGR - 02")
      this.loadMappingFromFile(
        path.join(WORKSPACE_ROOT, 'Book11.json'),
        'OTHER MVGR - 02',
        this.mainMvgrMap
      );
      console.log(`[MvgrMappingService] Loaded ${this.mainMvgrMap.size} main MVGR mappings from Book11.json`);

      // FAB 2 UPDATED.json -> M_FAB2
      this.loadMappingFromFile(
        path.join(WORKSPACE_ROOT, 'FAB 2 UPDATED.json'),
        'FAB2',
        this.weave2Map
      );
      console.log(`[MvgrMappingService] Loaded ${this.weave2Map.size} weave2 mappings from FAB 2 UPDATED.json`);

      this.isInitialized = true;
      console.log('[MvgrMappingService] Initialization complete');
    } catch (error) {
      console.error('[MvgrMappingService] Error during initialization:', error);
      throw error;
    }
  }

  private loadMappingFromFile(
    filePath: string,
    fieldKey: string,
    targetMap: Map<string, string>
  ): void {
    try {
      if (!fs.existsSync(filePath)) {
        console.warn(`[MvgrMappingService] File not found: ${filePath}`);
        return;
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const trimmed = fileContent.trim();

      let parsedJson: any;
      try {
        parsedJson = JSON.parse(trimmed);
      } catch {
        parsedJson = JSON.parse(`[${trimmed}]`);
      }

      const topLevelSheet =
        parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)
          ? Object.values(parsedJson).find((value) => Array.isArray(value))
          : null;

      const jsonArray = Array.isArray(topLevelSheet)
        ? topLevelSheet
        : Array.isArray(parsedJson)
          ? parsedJson
          : [];

      if (!Array.isArray(jsonArray) || jsonArray.length === 0) {
        console.warn(`[MvgrMappingService] Invalid JSON format in ${filePath}, expected array`);
        return;
      }

      for (const entry of jsonArray) {
        const code: string | undefined = entry[fieldKey];
        const fullForm: string | undefined = entry['FULL FORM'];
        if (code && fullForm) {
          targetMap.set(code.toUpperCase().trim(), fullForm.trim());
        }
      }
    } catch (error) {
      console.error(`[MvgrMappingService] Error loading mappings from ${filePath}:`, error);
      throw error;
    }
  }

  getMacroMvgrFullForm(code: string | null | undefined): string | null {
    if (!code) return null;
    return this.macroMvgrMap.get(code.toUpperCase().trim()) ?? null;
  }

  getMainMvgrFullForm(code: string | null | undefined): string | null {
    if (!code) return null;
    return this.mainMvgrMap.get(code.toUpperCase().trim()) ?? null;
  }

  getWeave2FullForm(code: string | null | undefined): string | null {
    if (!code) return null;
    return this.weave2Map.get(code.toUpperCase().trim()) ?? null;
  }

  getAllMacroMvgr(): Array<{ code: string; fullForm: string }> {
    return Array.from(this.macroMvgrMap.entries()).map(([code, fullForm]) => ({ code, fullForm }));
  }

  getAllMainMvgr(): Array<{ code: string; fullForm: string }> {
    return Array.from(this.mainMvgrMap.entries()).map(([code, fullForm]) => ({ code, fullForm }));
  }

  getAllWeave2(): Array<{ code: string; fullForm: string }> {
    return Array.from(this.weave2Map.entries()).map(([code, fullForm]) => ({ code, fullForm }));
  }

  getStats() {
    return {
      macroMvgrCount: this.macroMvgrMap.size,
      mainMvgrCount: this.mainMvgrMap.size,
      weave2Count: this.weave2Map.size,
      isInitialized: this.isInitialized,
    };
  }
}

export const mvgrMappingService = new MvgrMappingService();

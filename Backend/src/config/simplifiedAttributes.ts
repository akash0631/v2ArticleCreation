/**
 * Simplified Attribute Configuration
 * Fixed attribute list for simplified extraction
 * Confidence threshold: 65-75% minimum
 */

export interface SimplifiedAttribute {
  key: string;
  label: string;
  type: 'text' | 'select' | 'number' | 'boolean';
  confidenceThreshold: number; // Minimum confidence to show result
}

export const SIMPLIFIED_ATTRIBUTES: SimplifiedAttribute[] = [
  { key: 'division', label: 'Division', type: 'text', confidenceThreshold: 65 },
  { key: 'major_category', label: 'Major Category', type: 'text', confidenceThreshold: 65 },
  { key: 'reference_article_number', label: 'Reference Article Number', type: 'text', confidenceThreshold: 0 },
  { key: 'reference_article_description', label: 'Reference Article Description', type: 'text', confidenceThreshold: 0 },
  { key: 'vendor_name', label: 'Vendor Name', type: 'text', confidenceThreshold: 65 },
  { key: 'design_number', label: 'Design Number', type: 'text', confidenceThreshold: 65 },
  { key: 'ppt_number', label: 'PPT Number', type: 'text', confidenceThreshold: 65 },
  { key: 'rate', label: 'Rate/Price', type: 'text', confidenceThreshold: 65 },
  { key: 'size', label: 'Size', type: 'text', confidenceThreshold: 65 },
  { key: 'yarn_01', label: 'Yarn 1', type: 'text', confidenceThreshold: 65 },
  { key: 'yarn_02', label: 'Yarn 2', type: 'text', confidenceThreshold: 65 },
  { key: 'fabric_main_mvgr', label: 'Fabric Main MVGR', type: 'text', confidenceThreshold: 65 },
  { key: 'weave', label: 'Weave', type: 'text', confidenceThreshold: 65 },
  { key: 'composition', label: 'Composition', type: 'text', confidenceThreshold: 65 },
  { key: 'finish', label: 'Finish', type: 'text', confidenceThreshold: 65 },
  { key: 'gsm', label: 'GSM', type: 'text', confidenceThreshold: 65 },
  { key: 'shade', label: 'Shade', type: 'text', confidenceThreshold: 65 },
  { key: 'weight', label: 'G-Weight', type: 'text', confidenceThreshold: 65 },
  { key: 'lycra_non_lycra', label: 'Lycra/Non Lycra', type: 'text', confidenceThreshold: 65 },
  { key: 'neck', label: 'Neck', type: 'text', confidenceThreshold: 65 },
  { key: 'neck_details', label: 'Neck Details', type: 'text', confidenceThreshold: 65 },
  { key: 'collar', label: 'Collar', type: 'text', confidenceThreshold: 65 },
  { key: 'placket', label: 'Placket', type: 'text', confidenceThreshold: 65 },
  { key: 'sleeve', label: 'Sleeve', type: 'text', confidenceThreshold: 65 },
  { key: 'bottom_fold', label: 'Bottom Fold', type: 'text', confidenceThreshold: 65 },
  { key: 'front_open_style', label: 'Front Open Style', type: 'text', confidenceThreshold: 65 },
  { key: 'pocket_type', label: 'Pocket Type', type: 'text', confidenceThreshold: 50 },
  { key: 'fit', label: 'Fit', type: 'text', confidenceThreshold: 50 },
  { key: 'pattern', label: 'Pattern', type: 'text', confidenceThreshold: 65 },
  { key: 'length', label: 'Length', type: 'text', confidenceThreshold: 65 },
  { key: 'drawcord', label: 'Drawcord', type: 'text', confidenceThreshold: 65 },
  { key: 'button', label: 'Button', type: 'text', confidenceThreshold: 50 },
  { key: 'zipper', label: 'Zipper', type: 'text', confidenceThreshold: 50 },
  { key: 'zip_colour', label: 'Zip Colour', type: 'text', confidenceThreshold: 65 },
  { key: 'print_type', label: 'Print Type', type: 'text', confidenceThreshold: 65 },
  { key: 'print_style', label: 'Print Style', type: 'text', confidenceThreshold: 65 },
  { key: 'print_placement', label: 'Print Placement', type: 'text', confidenceThreshold: 65 },
  { key: 'patches', label: 'Patches', type: 'text', confidenceThreshold: 65 },
  { key: 'patches_type', label: 'Patches Type', type: 'text', confidenceThreshold: 65 },
  { key: 'embroidery', label: 'Embroidery', type: 'text', confidenceThreshold: 65 },
  { key: 'embroidery_type', label: 'Embroidery Type', type: 'text', confidenceThreshold: 65 },
  { key: 'wash', label: 'Wash', type: 'text', confidenceThreshold: 50 },
  { key: 'colour', label: 'Colour', type: 'text', confidenceThreshold: 50 },
  { key: 'father_belt', label: 'Father Belt', type: 'text', confidenceThreshold: 65 },
  { key: 'child_belt', label: 'Child Belt', type: 'text', confidenceThreshold: 65 },
];

/**
 * Convert simplified attributes to schema format for VLM
 */
export function getSimplifiedSchema() {
  return SIMPLIFIED_ATTRIBUTES.map(attr => ({
    key: attr.key,
    label: attr.label,
    type: attr.type,
    required: false,
    confidenceThreshold: attr.confidenceThreshold
  }));
}

/**
 * Filter extraction results by confidence threshold
 * Only return attributes that meet the minimum confidence
 */
export function filterByConfidence(attributes: any): any {
  const filtered: any = {};
  
  for (const attr of SIMPLIFIED_ATTRIBUTES) {
    const value = attributes[attr.key];
    if (value && value.visualConfidence >= attr.confidenceThreshold) {
      filtered[attr.key] = value;
    } else {
      // Leave blank if confidence too low
      filtered[attr.key] = null;
    }
  }
  
  return filtered;
}

const UPPER_ONLY_ATTRIBUTES = ['neck', 'neck_details', 'collar', 'placket', 'sleeve', 'front_open_style'];
const LOWER_ONLY_ATTRIBUTES = ['drawcord', 'father_belt', 'child_belt'];
const BOTTOM_ALLOWED_ATTRIBUTES = [
  'division', 'major_category', 'reference_article_number', 'reference_article_description', 'vendor_name', 'design_number', 'ppt_number', 'rate', 'size',
  'yarn_01', 'yarn_02', 'fabric_main_mvgr', 'weave', 'composition', 'finish', 'gsm', 'shade', 'weight', 'lycra_non_lycra',
  'pocket_type', 'fit', 'pattern', 'length', 'bottom_fold', 'drawcord', 'button', 'zipper',
  'zip_colour', 'print_type', 'print_style', 'print_placement', 'patches', 'patches_type',
  'embroidery', 'embroidery_type', 'wash', 'colour', 'father_belt', 'child_belt'
];

function isBottomCategory(majorCategory?: string): boolean {
  if (!majorCategory) return false;
  const value = majorCategory.toLowerCase();
  return value.includes('lower') || value.includes('denim') || value.includes('bottom') || value.includes('jean') || value.includes('pant') || value.includes('trouser') || value.includes('short') || value.includes('skirt') || value.includes('pyjama') || value.includes('legging') || value.includes('plazo') || value.includes('culottes') || value.includes('capri') || value.includes('bermuda') || value.includes('cargo') || value.includes('jogger');
}

function isTopCategory(majorCategory?: string): boolean {
  if (!majorCategory) return false;
  const value = majorCategory.toLowerCase();
  return value.includes('upper') || value.includes('top') || value.includes('shirt') || value.includes('t-shirt') || value.includes('tee') || value.includes('hoodie') || value.includes('sweater') || value.includes('jacket') || value.includes('blazer') || value.includes('outerwear') || value.includes('kurti') || value.includes('kurta') || value.includes('suit') || value.includes('activewear');
}

function isFullBodyCategory(majorCategory?: string): boolean {
  if (!majorCategory) return false;
  const value = majorCategory.toLowerCase();
  return value.includes('sets') || value === 'sets' || value.includes('dress') || value.includes('jumpsuit') || value.includes('romper') || value.includes('co-ord') || value.includes('coord') || value.includes('overall') || value.includes('set') || value.includes('kurti set') || value.includes('kurta set');
}

function isSetCategory(majorCategory?: string): boolean {
  if (!majorCategory) return false;
  const value = majorCategory.toLowerCase();
  return value.includes('set') || value.includes('co-ord') || value.includes('coord') || value.includes('kurti set') || value.includes('kurta set');
}

export function applyGarmentTypeRules(attributes: any, majorCategory?: string): any {
  if (!attributes || !majorCategory) return attributes;

  if (isFullBodyCategory(majorCategory)) {
    return attributes;
  }

  if (isBottomCategory(majorCategory)) {
    for (const key of Object.keys(attributes)) {
      if (!BOTTOM_ALLOWED_ATTRIBUTES.includes(key)) {
        attributes[key] = null;
      }
    }

    // Belt defaults for bottomwear
    if (attributes.father_belt === null || attributes.father_belt === undefined) {
      attributes.father_belt = {
        rawValue: 'FIXED _BLT',
        schemaValue: 'FIXED _BLT',
        visualConfidence: 65,
        isNewDiscovery: false,
        mappingConfidence: 65,
        reasoning: 'Bottomwear waistband present; defaulted to FIXED BELT'
      };
    }

    const elasticFatherBelts = ['ELS_BLT', 'IE', 'OE', 'HLF_ELS_BLT', '3/4 ELS_BLT', 'FLEXI'];
    const fatherBeltValue = attributes.father_belt?.schemaValue || attributes.father_belt?.rawValue;
    if (fatherBeltValue && (attributes.child_belt === null || attributes.child_belt === undefined)) {
      const isElastic = elasticFatherBelts.includes(String(fatherBeltValue));
      attributes.child_belt = {
        rawValue: isElastic ? 'SLF GTHR BLT' : 'SELF C&S BLT',
        schemaValue: isElastic ? 'SLF GTHR BLT' : 'SELF C&S BLT',
        visualConfidence: 60,
        isNewDiscovery: false,
        mappingConfidence: 60,
        reasoning: isElastic
          ? 'Elastic waistband; defaulted to SELF GATHER BELT'
          : 'Fixed waistband; defaulted to SELF CUT & SEW BELT'
      };
    }
  }

  // Default bottom_fold when missing
  if (attributes.bottom_fold === null || attributes.bottom_fold === undefined) {
    attributes.bottom_fold = {
      rawValue: 'BTM OPEN',
      schemaValue: 'BTM OPEN',
      visualConfidence: 60,
      isNewDiscovery: false,
      mappingConfidence: 60,
      reasoning: 'Bottom fold not detected; defaulted to BOTTOM OPEN'
    };
  }

  if (isTopCategory(majorCategory)) {
    for (const key of LOWER_ONLY_ATTRIBUTES) {
      attributes[key] = null;
    }
  }

  // If not lower and not set, belts must be null
  if (!isBottomCategory(majorCategory) && !isSetCategory(majorCategory)) {
    attributes.father_belt = null;
    attributes.child_belt = null;
  }

  return attributes;
}

/**
 * SyllaBud Grade Calculator Module
 * Handles weighted grading, points-based grading, and what-if scenarios
 * 
 * Important rule: Unfilled grade items are treated as 100%
 */

/**
 * Calculate weighted grade from categories
 * @param {Object} grading - Grading scheme from syllabus
 * @param {Object} userGrades - User's entered grades
 * @param {Object} settings - Calculator settings
 */
function calculateWeightedGrade(grading, userGrades = {}, settings = {}) {
  const { treatUnfilledAs = 100 } = settings;
  const categories = grading.categories || [];
  
  if (categories.length === 0) {
    return { grade: null, error: 'No grading categories defined' };
  }
  
  let totalWeight = 0;
  let earnedWeight = 0;
  const categoryResults = [];
  
  for (const category of categories) {
    const catResult = calculateCategoryGrade(category, userGrades, treatUnfilledAs);
    categoryResults.push(catResult);
    
    if (catResult.grade !== null) {
      const weight = parseFloat(category.weight) || 0;
      totalWeight += weight;
      earnedWeight += (catResult.grade / 100) * weight;
    }
  }
  
  // Handle extra credit
  let extraCreditBonus = 0;
  if (grading.extraCredit && grading.extraCredit.length > 0) {
    extraCreditBonus = calculateExtraCredit(grading.extraCredit, userGrades);
  }
  
  // Normalize if weights don't sum to 100
  let finalGrade;
  if (totalWeight > 0) {
    finalGrade = (earnedWeight / totalWeight) * 100;
  } else {
    finalGrade = treatUnfilledAs;
  }
  
  // Add extra credit
  finalGrade += extraCreditBonus;
  
  // Cap at reasonable maximum (some classes allow > 100)
  finalGrade = Math.min(finalGrade, 150);
  
  return {
    grade: Math.round(finalGrade * 100) / 100,
    categoryResults,
    totalWeight,
    extraCreditBonus,
    letterGrade: getLetterGrade(finalGrade, grading.letterGradeScale)
  };
}

/**
 * Calculate grade for a single category
 */
function calculateCategoryGrade(category, userGrades, treatUnfilledAs = 100) {
  const assignments = category.assignments || [];
  const categoryId = category.id || category.name;
  
  if (assignments.length === 0) {
    // Check if there's a direct category grade
    const directGrade = userGrades[categoryId];
    if (directGrade !== undefined && directGrade !== null && directGrade !== '') {
      return {
        category: category.name,
        grade: parseFloat(directGrade),
        assignmentCount: 0,
        filledCount: 0
      };
    }
    return {
      category: category.name,
      grade: treatUnfilledAs,
      assignmentCount: 0,
      filledCount: 0
    };
  }
  
  // Handle "drop lowest N" if specified
  const dropLowest = category.dropLowest || 0;
  
  let grades = [];
  let filledCount = 0;
  
  for (const assignment of assignments) {
    const assignmentId = assignment.id || assignment.title;
    const userGrade = userGrades[assignmentId];
    
    let gradeValue;
    if (userGrade !== undefined && userGrade !== null && userGrade !== '') {
      gradeValue = parseFloat(userGrade);
      filledCount++;
    } else {
      gradeValue = treatUnfilledAs;
    }
    
    // If points-based, convert to percentage
    if (assignment.pointsPossible && assignment.pointsPossible > 0) {
      if (userGrade !== undefined && userGrade !== null && userGrade !== '') {
        gradeValue = (parseFloat(userGrade) / assignment.pointsPossible) * 100;
      }
    }
    
    grades.push({
      id: assignmentId,
      grade: gradeValue,
      isFilled: userGrade !== undefined && userGrade !== null && userGrade !== ''
    });
  }
  
  // Apply drop lowest
  if (dropLowest > 0 && grades.length > dropLowest) {
    grades.sort((a, b) => a.grade - b.grade);
    grades = grades.slice(dropLowest);
  }
  
  // Calculate average
  const average = grades.length > 0
    ? grades.reduce((sum, g) => sum + g.grade, 0) / grades.length
    : treatUnfilledAs;
  
  return {
    category: category.name,
    grade: Math.round(average * 100) / 100,
    assignmentCount: assignments.length,
    filledCount,
    droppedCount: Math.min(dropLowest, assignments.length)
  };
}

/**
 * Calculate points-based grade
 */
function calculatePointsGrade(grading, userGrades = {}, settings = {}) {
  const { treatUnfilledAs = 100 } = settings;
  const assignments = grading.assignments || [];
  
  if (assignments.length === 0) {
    return { grade: null, error: 'No assignments defined' };
  }
  
  let totalPointsPossible = 0;
  let totalPointsEarned = 0;
  let filledCount = 0;
  
  for (const assignment of assignments) {
    const pointsPossible = parseFloat(assignment.pointsPossible) || 0;
    if (pointsPossible <= 0) continue;
    
    totalPointsPossible += pointsPossible;
    
    const assignmentId = assignment.id || assignment.title;
    const userGrade = userGrades[assignmentId];
    
    let pointsEarned;
    if (userGrade !== undefined && userGrade !== null && userGrade !== '') {
      pointsEarned = parseFloat(userGrade);
      filledCount++;
    } else {
      // Treat unfilled as 100%
      pointsEarned = (treatUnfilledAs / 100) * pointsPossible;
    }
    
    totalPointsEarned += pointsEarned;
  }
  
  // Handle extra credit
  let extraCreditPoints = 0;
  if (grading.extraCredit && grading.extraCredit.length > 0) {
    for (const ec of grading.extraCredit) {
      const ecId = ec.id || ec.title;
      const ecGrade = userGrades[ecId];
      if (ecGrade !== undefined && ecGrade !== null && ecGrade !== '') {
        extraCreditPoints += parseFloat(ecGrade);
      }
    }
  }
  
  totalPointsEarned += extraCreditPoints;
  
  const finalGrade = totalPointsPossible > 0
    ? (totalPointsEarned / totalPointsPossible) * 100
    : 0;
  
  return {
    grade: Math.round(finalGrade * 100) / 100,
    totalPointsEarned: Math.round(totalPointsEarned * 100) / 100,
    totalPointsPossible,
    extraCreditPoints,
    filledCount,
    totalAssignments: assignments.length,
    letterGrade: getLetterGrade(finalGrade, grading.letterGradeScale)
  };
}

/**
 * Calculate extra credit bonus
 */
function calculateExtraCredit(extraCreditItems, userGrades) {
  let bonus = 0;
  
  for (const ec of extraCreditItems) {
    const ecId = ec.id || ec.title;
    const ecGrade = userGrades[ecId];
    
    if (ecGrade !== undefined && ecGrade !== null && ecGrade !== '') {
      const value = parseFloat(ecGrade);
      
      switch (ec.type) {
        case 'percentage_add':
          // Adds directly to final percentage
          bonus += value;
          break;
        case 'points':
          // Points that get converted based on maxPoints
          if (ec.maxPoints && ec.percentageValue) {
            bonus += (value / ec.maxPoints) * ec.percentageValue;
          }
          break;
        case 'replacement':
          // Replaces lowest grade - handled elsewhere
          break;
        default:
          // Default: treat as additive percentage
          bonus += value;
      }
    }
  }
  
  return Math.round(bonus * 100) / 100;
}

/**
 * Get letter grade from percentage
 */
function getLetterGrade(percentage, scale = null) {
  // Use custom scale if provided
  if (scale && scale.length > 0) {
    // Sort by minimum descending
    const sortedScale = [...scale].sort((a, b) => b.min - a.min);
    
    for (const entry of sortedScale) {
      if (percentage >= entry.min) {
        return entry.letter;
      }
    }
    return 'F';
  }
  
  // Default scale
  if (percentage >= 93) return 'A';
  if (percentage >= 90) return 'A-';
  if (percentage >= 87) return 'B+';
  if (percentage >= 83) return 'B';
  if (percentage >= 80) return 'B-';
  if (percentage >= 77) return 'C+';
  if (percentage >= 73) return 'C';
  if (percentage >= 70) return 'C-';
  if (percentage >= 67) return 'D+';
  if (percentage >= 63) return 'D';
  if (percentage >= 60) return 'D-';
  return 'F';
}

/**
 * Main grade calculation - auto-detects scheme type
 */
function calculateGrade(courseData, options = {}) {
  const grading = courseData.grading || {};
  const userGrades = courseData.userGrades || {};
  const settings = courseData.settings || {};
  
  const schemeType = grading.schemeType || 'unknown';
  
  switch (schemeType) {
    case 'weighted':
      return {
        type: 'weighted',
        ...calculateWeightedGrade(grading, userGrades, settings)
      };
    
    case 'points':
      return {
        type: 'points',
        ...calculatePointsGrade(grading, userGrades, settings)
      };
    
    case 'mixed':
      // Calculate both and take the best
      const weighted = calculateWeightedGrade(grading, userGrades, settings);
      const points = calculatePointsGrade(grading, userGrades, settings);
      
      if (weighted.grade === null) return { type: 'points', ...points };
      if (points.grade === null) return { type: 'weighted', ...weighted };
      
      if (weighted.grade >= points.grade) {
        return { type: 'weighted (best)', ...weighted, alternateGrade: points.grade };
      } else {
        return { type: 'points (best)', ...points, alternateGrade: weighted.grade };
      }
    
    default:
      // Try weighted first, then points
      const tryWeighted = calculateWeightedGrade(grading, userGrades, settings);
      if (tryWeighted.grade !== null && !tryWeighted.error) {
        return { type: 'weighted (detected)', ...tryWeighted };
      }
      
      const tryPoints = calculatePointsGrade(grading, userGrades, settings);
      if (tryPoints.grade !== null && !tryPoints.error) {
        return { type: 'points (detected)', ...tryPoints };
      }
      
      return { type: 'unknown', grade: null, error: 'Could not determine grading scheme' };
  }
}

/**
 * What-if calculation - hypothetical grade scenarios
 */
function calculateWhatIf(courseData, hypotheticalGrades = {}) {
  // Merge hypothetical grades with existing
  const mergedGrades = {
    ...courseData.userGrades,
    ...hypotheticalGrades
  };
  
  const modifiedCourse = {
    ...courseData,
    userGrades: mergedGrades
  };
  
  return calculateGrade(modifiedCourse);
}

/**
 * Calculate minimum grade needed on remaining items to achieve target
 */
function calculateNeededGrade(courseData, targetGrade) {
  const grading = courseData.grading || {};
  const userGrades = courseData.userGrades || {};
  
  // Find unfilled assignments
  const allAssignments = [];
  
  if (grading.categories) {
    for (const cat of grading.categories) {
      for (const assignment of cat.assignments || []) {
        const id = assignment.id || assignment.title;
        if (userGrades[id] === undefined || userGrades[id] === null || userGrades[id] === '') {
          allAssignments.push({
            ...assignment,
            category: cat.name,
            categoryWeight: cat.weight
          });
        }
      }
    }
  }
  
  if (allAssignments.length === 0) {
    return { needed: null, message: 'All grades have been entered' };
  }
  
  // Binary search for needed grade
  let low = 0;
  let high = 100;
  let needed = null;
  
  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2;
    
    // Set all unfilled to mid
    const hypothetical = {};
    for (const a of allAssignments) {
      const id = a.id || a.title;
      hypothetical[id] = mid;
    }
    
    const result = calculateWhatIf(courseData, hypothetical);
    
    if (result.grade >= targetGrade) {
      needed = mid;
      high = mid;
    } else {
      low = mid;
    }
  }
  
  if (needed === null || needed > 100) {
    return {
      needed: null,
      achievable: false,
      message: `A ${targetGrade}% is not achievable with remaining assignments`
    };
  }
  
  return {
    needed: Math.round(needed * 100) / 100,
    achievable: true,
    remainingAssignments: allAssignments.length,
    message: `You need an average of ${Math.round(needed * 100) / 100}% on remaining assignments`
  };
}

/**
 * Get grade summary statistics
 */
function getGradeSummary(courseData) {
  const result = calculateGrade(courseData);
  const grading = courseData.grading || {};
  const userGrades = courseData.userGrades || {};
  
  // Count filled vs unfilled
  let totalItems = 0;
  let filledItems = 0;
  
  if (grading.categories) {
    for (const cat of grading.categories) {
      for (const assignment of cat.assignments || []) {
        totalItems++;
        const id = assignment.id || assignment.title;
        if (userGrades[id] !== undefined && userGrades[id] !== null && userGrades[id] !== '') {
          filledItems++;
        }
      }
    }
  }
  
  return {
    currentGrade: result.grade,
    letterGrade: result.letterGrade,
    gradeType: result.type,
    completionRate: totalItems > 0 ? Math.round((filledItems / totalItems) * 100) : 0,
    filledItems,
    totalItems,
    extraCreditEarned: result.extraCreditBonus || result.extraCreditPoints || 0
  };
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateWeightedGrade,
    calculateCategoryGrade,
    calculatePointsGrade,
    calculateExtraCredit,
    getLetterGrade,
    calculateGrade,
    calculateWhatIf,
    calculateNeededGrade,
    getGradeSummary
  };
}

export {
  calculateWeightedGrade,
  calculateCategoryGrade,
  calculatePointsGrade,
  calculateExtraCredit,
  getLetterGrade,
  calculateGrade,
  calculateWhatIf,
  calculateNeededGrade,
  getGradeSummary
};

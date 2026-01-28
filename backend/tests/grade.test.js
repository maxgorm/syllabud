/**
 * SyllaBud Grade Calculator Tests
 */

// Import grade module (simulated for testing)
const gradeModule = {
  calculateWeightedGrade,
  calculatePointsGrade,
  calculateCategoryGrade,
  getLetterGrade,
  calculateExtraCredit
};

/**
 * Calculate weighted grade from categories
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
  
  let extraCreditBonus = 0;
  if (grading.extraCredit && grading.extraCredit.length > 0) {
    extraCreditBonus = calculateExtraCredit(grading.extraCredit, userGrades);
  }
  
  let finalGrade;
  if (totalWeight > 0) {
    finalGrade = (earnedWeight / totalWeight) * 100;
  } else {
    finalGrade = treatUnfilledAs;
  }
  
  finalGrade += extraCreditBonus;
  finalGrade = Math.min(finalGrade, 150);
  
  return {
    grade: Math.round(finalGrade * 100) / 100,
    categoryResults,
    totalWeight,
    extraCreditBonus,
    letterGrade: getLetterGrade(finalGrade, grading.letterGradeScale)
  };
}

function calculateCategoryGrade(category, userGrades, treatUnfilledAs = 100) {
  const assignments = category.assignments || [];
  const categoryId = category.id || category.name;
  
  if (assignments.length === 0) {
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
  
  if (dropLowest > 0 && grades.length > dropLowest) {
    grades.sort((a, b) => a.grade - b.grade);
    grades = grades.slice(dropLowest);
  }
  
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
      pointsEarned = (treatUnfilledAs / 100) * pointsPossible;
    }
    
    totalPointsEarned += pointsEarned;
  }
  
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

function calculateExtraCredit(extraCreditItems, userGrades) {
  let bonus = 0;
  
  for (const ec of extraCreditItems) {
    const ecId = ec.id || ec.title;
    const ecGrade = userGrades[ecId];
    
    if (ecGrade !== undefined && ecGrade !== null && ecGrade !== '') {
      const value = parseFloat(ecGrade);
      
      switch (ec.type) {
        case 'percentage_add':
          bonus += value;
          break;
        case 'points':
          if (ec.maxPoints && ec.percentageValue) {
            bonus += (value / ec.maxPoints) * ec.percentageValue;
          }
          break;
        default:
          bonus += value;
      }
    }
  }
  
  return Math.round(bonus * 100) / 100;
}

function getLetterGrade(percentage, scale = null) {
  if (scale && scale.length > 0) {
    const sortedScale = [...scale].sort((a, b) => b.min - a.min);
    
    for (const entry of sortedScale) {
      if (percentage >= entry.min) {
        return entry.letter;
      }
    }
    return 'F';
  }
  
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

// ============== TESTS ==============

function runTests() {
  let passed = 0;
  let failed = 0;
  
  function test(name, fn) {
    try {
      fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (error) {
      console.log(`✗ ${name}`);
      console.log(`  Error: ${error.message}`);
      failed++;
    }
  }
  
  function assertEqual(actual, expected, message = '') {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${message}\n    Expected: ${JSON.stringify(expected)}\n    Actual: ${JSON.stringify(actual)}`);
    }
  }
  
  function assertClose(actual, expected, tolerance = 0.01, message = '') {
    if (Math.abs(actual - expected) > tolerance) {
      throw new Error(`${message}\n    Expected: ~${expected}\n    Actual: ${actual}`);
    }
  }
  
  console.log('\n========== GRADE CALCULATOR TESTS ==========\n');
  
  // Test 1: Basic weighted grade calculation
  test('calculates basic weighted grade', () => {
    const grading = {
      schemeType: 'weighted',
      categories: [
        {
          id: 'homework',
          name: 'Homework',
          weight: 30,
          assignments: [
            { id: 'hw1', title: 'Homework 1' },
            { id: 'hw2', title: 'Homework 2' }
          ]
        },
        {
          id: 'exams',
          name: 'Exams',
          weight: 70,
          assignments: [
            { id: 'exam1', title: 'Midterm' },
            { id: 'exam2', title: 'Final' }
          ]
        }
      ]
    };
    
    const userGrades = {
      hw1: 90,
      hw2: 100,
      exam1: 85,
      exam2: 80
    };
    
    const result = calculateWeightedGrade(grading, userGrades);
    // Homework: (90 + 100) / 2 = 95, contributes 95 * 0.30 = 28.5
    // Exams: (85 + 80) / 2 = 82.5, contributes 82.5 * 0.70 = 57.75
    // Total: 28.5 + 57.75 = 86.25
    assertClose(result.grade, 86.25, 0.1);
    assertEqual(result.letterGrade, 'B');
  });
  
  // Test 2: Unfilled grades default to 100%
  test('treats unfilled grades as 100%', () => {
    const grading = {
      categories: [
        {
          id: 'homework',
          name: 'Homework',
          weight: 100,
          assignments: [
            { id: 'hw1', title: 'Homework 1' },
            { id: 'hw2', title: 'Homework 2' }
          ]
        }
      ]
    };
    
    const userGrades = {
      hw1: 80
      // hw2 is unfilled, should default to 100
    };
    
    const result = calculateWeightedGrade(grading, userGrades, { treatUnfilledAs: 100 });
    // (80 + 100) / 2 = 90
    assertClose(result.grade, 90, 0.1);
  });
  
  // Test 3: Custom unfilled value
  test('respects custom treatUnfilledAs setting', () => {
    const grading = {
      categories: [
        {
          id: 'homework',
          name: 'Homework',
          weight: 100,
          assignments: [
            { id: 'hw1', title: 'Homework 1' },
            { id: 'hw2', title: 'Homework 2' }
          ]
        }
      ]
    };
    
    const userGrades = {
      hw1: 80
    };
    
    const result = calculateWeightedGrade(grading, userGrades, { treatUnfilledAs: 0 });
    // (80 + 0) / 2 = 40
    assertClose(result.grade, 40, 0.1);
  });
  
  // Test 4: Drop lowest grades
  test('drops lowest N grades when specified', () => {
    const grading = {
      categories: [
        {
          id: 'homework',
          name: 'Homework',
          weight: 100,
          dropLowest: 1,
          assignments: [
            { id: 'hw1', title: 'Homework 1' },
            { id: 'hw2', title: 'Homework 2' },
            { id: 'hw3', title: 'Homework 3' }
          ]
        }
      ]
    };
    
    const userGrades = {
      hw1: 90,
      hw2: 60, // This should be dropped
      hw3: 100
    };
    
    const result = calculateWeightedGrade(grading, userGrades);
    // After dropping 60: (90 + 100) / 2 = 95
    assertClose(result.grade, 95, 0.1);
  });
  
  // Test 5: Points-based grading
  test('calculates points-based grade', () => {
    const grading = {
      schemeType: 'points',
      assignments: [
        { id: 'hw1', title: 'Homework 1', pointsPossible: 100 },
        { id: 'hw2', title: 'Homework 2', pointsPossible: 50 },
        { id: 'exam', title: 'Exam', pointsPossible: 200 }
      ]
    };
    
    const userGrades = {
      hw1: 90,
      hw2: 45,
      exam: 180
    };
    
    const result = calculatePointsGrade(grading, userGrades);
    // Total earned: 90 + 45 + 180 = 315
    // Total possible: 100 + 50 + 200 = 350
    // Grade: (315 / 350) * 100 = 90%
    assertClose(result.grade, 90, 0.1);
    assertEqual(result.totalPointsEarned, 315);
    assertEqual(result.totalPointsPossible, 350);
  });
  
  // Test 6: Extra credit - percentage add
  test('handles percentage-add extra credit', () => {
    const grading = {
      categories: [
        {
          id: 'homework',
          name: 'Homework',
          weight: 100,
          assignments: [
            { id: 'hw1', title: 'Homework 1' }
          ]
        }
      ],
      extraCredit: [
        { id: 'ec1', title: 'Extra Credit', type: 'percentage_add' }
      ]
    };
    
    const userGrades = {
      hw1: 85,
      ec1: 5 // 5% bonus
    };
    
    const result = calculateWeightedGrade(grading, userGrades);
    // Base: 85, Extra: +5, Total: 90
    assertClose(result.grade, 90, 0.1);
    assertEqual(result.extraCreditBonus, 5);
  });
  
  // Test 7: Letter grade boundaries
  test('returns correct letter grades', () => {
    assertEqual(getLetterGrade(95), 'A');
    assertEqual(getLetterGrade(92), 'A-');
    assertEqual(getLetterGrade(88), 'B+');
    assertEqual(getLetterGrade(84), 'B');
    assertEqual(getLetterGrade(80), 'B-');
    assertEqual(getLetterGrade(77), 'C+');
    assertEqual(getLetterGrade(73), 'C');
    assertEqual(getLetterGrade(70), 'C-');
    assertEqual(getLetterGrade(67), 'D+');
    assertEqual(getLetterGrade(63), 'D');
    assertEqual(getLetterGrade(60), 'D-');
    assertEqual(getLetterGrade(55), 'F');
  });
  
  // Test 8: Custom letter grade scale
  test('uses custom letter grade scale', () => {
    const customScale = [
      { letter: 'A', min: 90 },
      { letter: 'B', min: 80 },
      { letter: 'C', min: 70 },
      { letter: 'D', min: 60 },
      { letter: 'F', min: 0 }
    ];
    
    assertEqual(getLetterGrade(91, customScale), 'A');
    assertEqual(getLetterGrade(85, customScale), 'B');
    assertEqual(getLetterGrade(75, customScale), 'C');
    assertEqual(getLetterGrade(65, customScale), 'D');
    assertEqual(getLetterGrade(50, customScale), 'F');
  });
  
  // Test 9: Empty categories
  test('handles empty categories', () => {
    const grading = {
      categories: []
    };
    
    const result = calculateWeightedGrade(grading, {});
    assertEqual(result.grade, null);
    assertEqual(result.error, 'No grading categories defined');
  });
  
  // Test 10: Category with no assignments
  test('handles category with no assignments', () => {
    const grading = {
      categories: [
        {
          id: 'participation',
          name: 'Participation',
          weight: 100,
          assignments: []
        }
      ]
    };
    
    // Direct category grade
    const userGrades = {
      participation: 95
    };
    
    const result = calculateWeightedGrade(grading, userGrades);
    assertClose(result.grade, 95, 0.1);
  });
  
  // Test 11: Multiple drop lowest
  test('drops multiple lowest grades', () => {
    const grading = {
      categories: [
        {
          id: 'quizzes',
          name: 'Quizzes',
          weight: 100,
          dropLowest: 2,
          assignments: [
            { id: 'q1', title: 'Quiz 1' },
            { id: 'q2', title: 'Quiz 2' },
            { id: 'q3', title: 'Quiz 3' },
            { id: 'q4', title: 'Quiz 4' },
            { id: 'q5', title: 'Quiz 5' }
          ]
        }
      ]
    };
    
    const userGrades = {
      q1: 100,
      q2: 50, // Drop
      q3: 90,
      q4: 60, // Drop
      q5: 100
    };
    
    const result = calculateWeightedGrade(grading, userGrades);
    // After dropping 50 and 60: (100 + 90 + 100) / 3 = 96.67
    assertClose(result.grade, 96.67, 0.1);
  });
  
  // Test 12: Grade cap at 150%
  test('caps grade at 150%', () => {
    const grading = {
      categories: [
        {
          id: 'homework',
          name: 'Homework',
          weight: 100,
          assignments: [
            { id: 'hw1', title: 'Homework 1' }
          ]
        }
      ],
      extraCredit: [
        { id: 'ec1', title: 'Extra Credit 1', type: 'percentage_add' },
        { id: 'ec2', title: 'Extra Credit 2', type: 'percentage_add' }
      ]
    };
    
    const userGrades = {
      hw1: 100,
      ec1: 50,
      ec2: 50 // Would give 200% without cap
    };
    
    const result = calculateWeightedGrade(grading, userGrades);
    assertEqual(result.grade, 150);
  });
  
  // Summary
  console.log('\n========================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');
  
  return { passed, failed };
}

// Run tests if executed directly
if (typeof process !== 'undefined' && process.argv[1].includes('grade.test')) {
  runTests();
}

export { runTests };

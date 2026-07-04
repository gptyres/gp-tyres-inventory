import { describe, expect, it } from 'vitest';
import {
  TRAINING_TASKS,
  getAllStaffTrainingProgress,
  normalizeStaffTaskState,
  trainingProgressRowsToStore
} from './trainingProgress';

describe('training progress sync helpers', () => {
  it('keeps only known training task ids when normalizing progress', () => {
    expect(normalizeStaffTaskState({
      login: true,
      quote: 1,
      unknown_task: true,
      sale: false
    })).toEqual({
      login: true,
      quote: true,
      sale: false
    });
  });

  it('turns Supabase rows into the same progress summaries used by the dashboard', () => {
    const store = trainingProgressRowsToStore([
      {
        staff_name: 'Noor',
        tasks: {
          login: true,
          quote: true,
          'supplier-visuals': true
        }
      },
      {
        staff_name: 'Rafiek',
        tasks: {
          login: true
        }
      }
    ]);

    const summaries = getAllStaffTrainingProgress(['Noor', 'Rafiek'], store);

    expect(summaries[0]).toMatchObject({
      staffName: 'Noor',
      completed: 3,
      total: TRAINING_TASKS.length
    });
    expect(summaries[1]).toMatchObject({
      staffName: 'Rafiek',
      completed: 1,
      total: TRAINING_TASKS.length
    });
  });
});

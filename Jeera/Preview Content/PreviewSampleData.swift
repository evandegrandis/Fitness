import Foundation
import SwiftData

@MainActor
let previewContainer: ModelContainer = {
    let schema = Schema([
        Exercise.self,
        MuscleMapping.self,
        WorkoutTemplate.self,
        TemplateExercise.self,
        WorkoutSession.self,
        LoggedExercise.self,
        LoggedSet.self,
        MuscleGoal.self,
        UserSettings.self,
    ])
    let config = ModelConfiguration(isStoredInMemoryOnly: true)

    do {
        let container = try ModelContainer(for: schema, configurations: [config])
        SeedData.seed(context: container.mainContext)
        return container
    } catch {
        fatalError("Failed to create preview container: \(error)")
    }
}()

extension Exercise {
    static var preview: Exercise {
        Exercise(
            name: "Chest Press",
            category: "Push",
            setPatternMode: .topSetBackoff,
            repTargetMin: 6,
            repTargetMax: 10,
            smallestIncrement: 2.5,
            isFavorite: true,
            muscleMappings: [
                MuscleMapping(muscleGroup: .chest, coefficient: 1.0),
                MuscleMapping(muscleGroup: .triceps, coefficient: 0.3),
                MuscleMapping(muscleGroup: .frontdelts, coefficient: 0.3),
            ]
        )
    }
}

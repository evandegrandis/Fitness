import SwiftUI
import SwiftData

@main
struct JeeraApp: App {
    var sharedModelContainer: ModelContainer = {
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
        let modelConfiguration = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: false
        )

        do {
            return try ModelContainer(for: schema, configurations: [modelConfiguration])
        } catch {
            fatalError("Could not create ModelContainer: \(error)")
        }
    }()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .preferredColorScheme(.dark)
        }
        .modelContainer(sharedModelContainer)
    }
}

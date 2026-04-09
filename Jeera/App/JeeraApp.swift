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

        // Try normal load first
        if let container = try? ModelContainer(for: schema, configurations: [modelConfiguration]) {
            return container
        }

        // Schema changed (e.g. new properties added) — wipe store and start fresh.
        // Data can be restored from a JSON backup via Settings.
        if let supportDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first {
            let storeFiles = (try? FileManager.default.contentsOfDirectory(at: supportDir, includingPropertiesForKeys: nil)) ?? []
            for file in storeFiles where file.pathExtension == "sqlite" || file.lastPathComponent.hasSuffix(".store") {
                try? FileManager.default.removeItem(at: file)
            }
        }

        do {
            return try ModelContainer(for: schema, configurations: [modelConfiguration])
        } catch {
            fatalError("Could not create ModelContainer after reset: \(error)")
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

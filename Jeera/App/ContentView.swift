import SwiftUI
import SwiftData

struct ContentView: View {
    @Environment(\.modelContext) private var modelContext
    @State private var selectedTab = 0
    @State private var hasSeeded = false
    @State private var workoutVM = WorkoutViewModel()

    var body: some View {
        TabView(selection: $selectedTab) {
            WorkoutTabView(viewModel: workoutVM)
                .tabItem {
                    Label("Séance", systemImage: "figure.strengthtraining.traditional")
                }
                .tag(0)

            ProgressTabView()
                .tabItem {
                    Label("Progrès", systemImage: "chart.bar.fill")
                }
                .tag(1)

            HistoryTabView()
                .tabItem {
                    Label("Historique", systemImage: "clock.arrow.circlepath")
                }
                .tag(2)
        }
        .tint(Color.accentColor)
        .onAppear {
            workoutVM.modelContext = modelContext
            workoutVM.loadActiveSession()
            seedIfNeeded()

            // Load settings defaults
            let descriptor = FetchDescriptor<UserSettings>()
            if let settings = try? modelContext.fetch(descriptor).first {
                workoutVM.defaultRestSeconds = settings.defaultRestTimerSeconds
                workoutVM.supersetRestSeconds = settings.supersetRestSeconds
            }
        }
    }

    private func seedIfNeeded() {
        let descriptor = FetchDescriptor<Exercise>()
        let count = (try? modelContext.fetch(descriptor).count) ?? 0
        guard count == 0 else { return }
        SeedData.seed(context: modelContext)
    }
}

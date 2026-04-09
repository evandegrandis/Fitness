import SwiftUI
import SwiftData

struct WorkoutTabView: View {
    @Bindable var viewModel: WorkoutViewModel
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            ZStack {
                BackgroundGradient()

                if viewModel.activeSession != nil {
                    ActiveWorkoutView(viewModel: viewModel)
                } else {
                    QuickStartView(viewModel: viewModel)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                            .font(.body)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .sheet(isPresented: $showSettings) {
                SettingsView()
            }
        }
    }
}

struct BackgroundGradient: View {
    var body: some View {
        ZStack {
            // Warmer, lighter dark base
            LinearGradient(
                colors: [
                    Color(red: 0.10, green: 0.10, blue: 0.16),
                    Color(red: 0.06, green: 0.06, blue: 0.10)
                ],
                startPoint: .top,
                endPoint: .bottom
            )

            // Subtle blue/purple ambient glow at top
            RadialGradient(
                colors: [
                    Color(red: 0.15, green: 0.12, blue: 0.30).opacity(0.4),
                    .clear
                ],
                center: .topLeading,
                startRadius: 20,
                endRadius: 400
            )
        }
        .ignoresSafeArea()
    }
}

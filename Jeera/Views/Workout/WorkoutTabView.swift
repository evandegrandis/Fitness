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
        LinearGradient(
            colors: [
                Color(red: 0.11, green: 0.12, blue: 0.18),
                Color(red: 0.08, green: 0.09, blue: 0.13)
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
    }
}

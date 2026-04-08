import SwiftUI
import SwiftData

struct ProgressTabView: View {
    @State private var selectedLayer = 0

    var body: some View {
        NavigationStack {
            ZStack {
                BackgroundGradient()

                VStack(spacing: 0) {
                    // Segmented Picker
                    Picker("Layer", selection: $selectedLayer) {
                        Text("Muscles").tag(0)
                        Text("Exercices").tag(1)
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal)
                    .padding(.top, 8)

                    TabView(selection: $selectedLayer) {
                        MuscleProgressView()
                            .tag(0)

                        ExerciseProgressView()
                            .tag(1)
                    }
                    .tabViewStyle(.page(indexDisplayMode: .never))
                }
            }
            .navigationTitle("Progrès")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

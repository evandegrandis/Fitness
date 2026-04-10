import SwiftUI

struct AchievementOverlayView: View {
    let achievement: ProgressionEngine.Achievement
    @State private var scale: CGFloat = 0.5
    @State private var opacity: Double = 0

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "trophy.fill")
                .font(.title)
                .foregroundStyle(.yellow)

            Text(achievement.title)
                .font(.subheadline.weight(.bold))

            Text(achievement.detail)
                .font(.caption.weight(.medium).monospacedDigit())
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 20)
        .background {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(red: 0.14, green: 0.15, blue: 0.22).opacity(0.98))
                .overlay {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(
                            LinearGradient(
                                colors: [.yellow.opacity(0.5), .orange.opacity(0.3)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 1
                        )
                }
                .shadow(color: .yellow.opacity(0.15), radius: 16)
        }
        .scaleEffect(scale)
        .opacity(opacity)
        .onAppear {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) {
                scale = 1.0
                opacity = 1.0
            }
        }
    }
}

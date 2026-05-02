import SwiftUI

struct AchievementOverlayView: View {
    let achievement: ProgressionEngine.Achievement
    @State private var scale: CGFloat = 0.74
    @State private var opacity: Double = 0
    @State private var glowScale: CGFloat = 0.7
    @State private var spin = false
    @State private var burst = false

    var body: some View {
        ZStack {
            Circle()
                .fill(.yellow.opacity(0.10))
                .frame(width: 220, height: 220)
                .blur(radius: 20)
                .scaleEffect(glowScale)
                .opacity(opacity * 0.8)

            ForEach(0..<8, id: \.self) { index in
                Capsule(style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [.yellow.opacity(0.95), .orange.opacity(0.35)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .frame(width: 6, height: burst ? 28 : 10)
                    .offset(y: burst ? -88 : -58)
                    .rotationEffect(.degrees(Double(index) * 45))
                    .opacity(burst ? 0 : opacity * 0.8)
            }

            VStack(spacing: 10) {
                ZStack {
                    Circle()
                        .stroke(
                            AngularGradient(
                                colors: [.yellow, .orange, .yellow.opacity(0.3), .yellow],
                                center: .center
                            ),
                            lineWidth: 3
                        )
                        .frame(width: 68, height: 68)
                        .rotationEffect(.degrees(spin ? 360 : 0))

                    Circle()
                        .fill(.white.opacity(0.05))
                        .frame(width: 56, height: 56)

                    Image(systemName: "trophy.fill")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(.yellow)
                }

                Text(achievement.title)
                    .font(.headline.weight(.black))

                Text(achievement.detail)
                    .font(.caption.weight(.medium).monospacedDigit())
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 30)
            .padding(.vertical, 22)
            .background {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                Color(red: 0.18, green: 0.15, blue: 0.09).opacity(0.96),
                                Color(red: 0.10, green: 0.09, blue: 0.16).opacity(0.98)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .overlay {
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .stroke(
                                LinearGradient(
                                    colors: [.yellow.opacity(0.75), .orange.opacity(0.35), .white.opacity(0.08)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 1.2
                            )
                    }
                    .shadow(color: .yellow.opacity(0.20), radius: 24, y: 10)
            }
        }
        .scaleEffect(scale)
        .opacity(opacity)
        .onAppear {
            withAnimation(.spring(response: 0.44, dampingFraction: 0.65)) {
                scale = 1.0
                opacity = 1.0
            }
            withAnimation(.easeOut(duration: 0.55)) {
                glowScale = 1.0
            }
            withAnimation(.linear(duration: 1.4)) {
                spin = true
            }
            withAnimation(.easeOut(duration: 0.5)) {
                burst = true
            }
        }
    }
}

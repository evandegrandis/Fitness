import SwiftUI

struct ProgressRing: View {
    let progress: Double
    var lineWidth: CGFloat = 6
    var size: CGFloat = 48
    var accentColor: Color = .accentColor

    private var clampedProgress: Double {
        min(max(progress / 100, 0), 1)
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(accentColor.opacity(0.15), lineWidth: lineWidth)

            Circle()
                .trim(from: 0, to: clampedProgress)
                .stroke(
                    accentColor,
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .animation(.spring(response: 0.5), value: clampedProgress)
        }
        .frame(width: size, height: size)
    }
}

struct ProgressBar: View {
    let progress: Double
    var height: CGFloat = 8
    var accentColor: Color = .accentColor

    private var clampedProgress: Double {
        min(max(progress / 100, 0), 1)
    }

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: height / 2)
                    .fill(accentColor.opacity(0.15))

                RoundedRectangle(cornerRadius: height / 2)
                    .fill(accentColor)
                    .frame(width: geo.size.width * clampedProgress)
                    .animation(.spring(response: 0.5), value: clampedProgress)
            }
        }
        .frame(height: height)
    }
}

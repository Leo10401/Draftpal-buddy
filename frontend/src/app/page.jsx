"use client"

import Link from "next/link"
import { useSession } from "next-auth/react"
import ComposePage from "./compose/page"
import { ArrowRight, Mail, Sparkles, Clock, CheckCircle } from "lucide-react"

export default function Home() {
  const { data: session, status } = useSession()
  const loading = status === "loading"
  const user = session?.user

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-white to-gray-50">
        <div className="container mx-auto px-4 py-12">
          <nav className="flex justify-between items-center mb-16">
            <div className="flex items-center">
              <Mail className="h-8 w-8 text-blue-600 mr-2" />
              <span className="text-2xl font-bold text-gray-900">DraftPal</span>
            </div>
            <Link href="/login" className="text-blue-600 font-medium hover:text-blue-700 transition">
              Log in
            </Link>
          </nav>

          <div className="flex flex-col lg:flex-row items-center gap-12 py-12">
            <div className="lg:w-1/2 space-y-6">
              <h1 className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight">
                Craft perfect emails with <span className="text-blue-600">DraftPal</span>
              </h1>
              <p className="text-xl text-gray-600">
                Write professional, effective emails in seconds using your Google account. Save time and make a better
                impression with every message.
              </p>
              <div className="pt-4">
                <Link
                  href="/login"
                  className="inline-flex items-center bg-blue-600 text-white font-medium py-3 px-6 rounded-md text-center hover:bg-blue-700 transition"
                >
                  Get Started <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </div>

              <div className="pt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex items-start">
                  <Sparkles className="h-5 w-5 text-blue-600 mt-1 mr-2" />
                  <div>
                    <h3 className="font-medium text-gray-900">AI-Powered</h3>
                    <p className="text-gray-600 text-sm">Smart suggestions for better emails</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <Clock className="h-5 w-5 text-blue-600 mt-1 mr-2" />
                  <div>
                    <h3 className="font-medium text-gray-900">Time-Saving</h3>
                    <p className="text-gray-600 text-sm">Create emails in seconds, not minutes</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-blue-600 mt-1 mr-2" />
                  <div>
                    <h3 className="font-medium text-gray-900">Professional</h3>
                    <p className="text-gray-600 text-sm">Always send the right message</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:w-1/2">
              <div className="bg-white rounded-xl shadow-xl p-6 border border-gray-200">
                <div className="flex items-center mb-4">
                  <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                </div>
                <div className="space-y-4">
                  <div className="bg-gray-100 rounded-lg p-4">
                    <div className="text-sm text-gray-800 font-medium mb-1">Subject</div>
                    <div className="text-gray-700">Meeting Follow-up: Next Steps for Project Alpha</div>
                  </div>
                  <div className="bg-gray-100 rounded-lg p-4">
                    <div className="text-sm text-gray-800 font-medium mb-1">Email Body</div>
                    <div className="text-gray-700 space-y-2">
                      <p>Hi Team,</p>
                      <p>
                        Thank you for your participation in today&apos;s meeting. I wanted to follow up with a summary of our
                        discussion and outline the next steps for Project Alpha.
                      </p>
                      <p>Looking forward to our continued collaboration.</p>
                      <p>Best regards,</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ComposePage />
    </div>
  )
}

import { useState, useEffect } from "react";
import liff from "@line/liff";
import Swal from "sweetalert2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Calendar, User, FileText } from "lucide-react";

const LIFF_ID = "YOUR_LIFF_ID_HERE"; // Replace with your LIFF ID
const WEBHOOK_URL = "https://thirstless-ostensively-maryam.ngrok-free.dev/webhook/submit-leave";

interface FormData {
  userName: string;
  userId: string;
  leaveType: string;
  startDateTime: string;
  endDateTime: string;
  reason: string;
}

const LeaveRequestForm = () => {
  const [isLiffInitialized, setIsLiffInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    userName: "",
    userId: "",
    leaveType: "",
    startDateTime: "",
    endDateTime: "",
    reason: "",
  });

  useEffect(() => {
    initializeLiff();
  }, []);

  const initializeLiff = async () => {
    try {
      await liff.init({ liffId: LIFF_ID });
      setIsLiffInitialized(true);

      if (liff.isLoggedIn()) {
        const profile = await liff.getProfile();
        setFormData((prev) => ({
          ...prev,
          userName: profile.displayName,
          userId: profile.userId,
        }));
      } else {
        liff.login();
      }
    } catch (err) {
      console.error("LIFF initialization failed:", err);
      setError("Failed to initialize LINE LIFF. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.leaveType || !formData.startDateTime || !formData.endDateTime || !formData.reason) {
      Swal.fire({
        icon: "warning",
        title: "Incomplete Form",
        text: "Please fill in all required fields.",
        confirmButtonColor: "#06C755",
      });
      return;
    }

    if (new Date(formData.endDateTime) < new Date(formData.startDateTime)) {
      Swal.fire({
        icon: "warning",
        title: "Invalid Dates",
        text: "End date must be after start date.",
        confirmButtonColor: "#06C755",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        mode: "no-cors",
        body: JSON.stringify({
          userName: formData.userName,
          userId: formData.userId,
          leaveType: formData.leaveType,
          startDateTime: formData.startDateTime,
          endDateTime: formData.endDateTime,
          reason: formData.reason,
          submittedAt: new Date().toISOString(),
        }),
      });

      await Swal.fire({
        icon: "success",
        title: "Request Submitted!",
        text: "Your leave request has been sent successfully.",
        confirmButtonColor: "#06C755",
      });

      if (liff.isInClient()) {
        liff.closeWindow();
      }
    } catch (err) {
      console.error("Submission failed:", err);
      Swal.fire({
        icon: "error",
        title: "Submission Failed",
        text: "Failed to submit your request. Please try again.",
        confirmButtonColor: "#06C755",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#06C755] flex items-center justify-center">
        <div className="text-center text-white">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" />
          <p className="text-lg font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#06C755] flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button
              onClick={() => window.location.reload()}
              className="bg-[#06C755] hover:bg-[#05a647]"
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#06C755]">
      {/* Header */}
      <div className="bg-[#06C755] text-white py-6 px-4 text-center">
        <h1 className="text-2xl font-bold">Leave Request</h1>
        <p className="text-sm opacity-90 mt-1">Submit your leave application</p>
      </div>

      {/* Form Card */}
      <div className="px-4 pb-6 -mt-2">
        <Card className="rounded-t-3xl shadow-lg">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* User Name */}
              <div className="space-y-2">
                <Label htmlFor="userName" className="flex items-center gap-2 text-muted-foreground">
                  <User className="h-4 w-4" />
                  User Name
                </Label>
                <Input
                  id="userName"
                  value={formData.userName}
                  readOnly
                  className="bg-muted/50"
                />
              </div>

              {/* Leave Type */}
              <div className="space-y-2">
                <Label htmlFor="leaveType" className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  Leave Type *
                </Label>
                <Select
                  value={formData.leaveType}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, leaveType: value }))
                  }
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select leave type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sick">Sick Leave</SelectItem>
                    <SelectItem value="annual">Annual Leave</SelectItem>
                    <SelectItem value="personal">Personal Leave</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Start Date & Time */}
              <div className="space-y-2">
                <Label htmlFor="startDateTime" className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  Start Date & Time *
                </Label>
                <Input
                  id="startDateTime"
                  type="datetime-local"
                  value={formData.startDateTime}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, startDateTime: e.target.value }))
                  }
                  className="bg-background"
                />
              </div>

              {/* End Date & Time */}
              <div className="space-y-2">
                <Label htmlFor="endDateTime" className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  End Date & Time *
                </Label>
                <Input
                  id="endDateTime"
                  type="datetime-local"
                  value={formData.endDateTime}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, endDateTime: e.target.value }))
                  }
                  className="bg-background"
                />
              </div>

              {/* Reason */}
              <div className="space-y-2">
                <Label htmlFor="reason" className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  Reason *
                </Label>
                <Textarea
                  id="reason"
                  placeholder="Please describe your reason for leave..."
                  value={formData.reason}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, reason: e.target.value }))
                  }
                  className="min-h-[100px] bg-background resize-none"
                />
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-12 text-lg font-semibold bg-[#06C755] hover:bg-[#05a647] text-white rounded-xl shadow-md"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Request"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LeaveRequestForm;

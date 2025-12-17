import LeaveRequestForm from "@/components/LeaveRequestForm";

interface LeaveRequestProps {
  userId?: string;
  userName?: string;
  initialLeaveType?: string;
}

const LeaveRequest = ({ userId, userName, initialLeaveType }: LeaveRequestProps) => {
  return (
    <LeaveRequestForm 
      userId={userId} 
      userName={userName} 
      initialLeaveType={initialLeaveType} 
    />
  );
};

export default LeaveRequest;